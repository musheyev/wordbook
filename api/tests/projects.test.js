// Tests for My Projects on the server (../projects.js), with no AWS at all:
// the DynamoDB client is swapped for a small in-memory one that answers the
// few calls projects.js makes. Run with:  npm test   (in api/)
//
// The tests/ folder is left out of the Lambda bundle (infra exclude list).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const database = require("../dynamoDb");

// ---- An in-memory stand-in for the DynamoDB document client ----------------
// Rows live in a Map keyed by "table|user_name|sort key". Each method returns
// { promise() } like the adapter in dynamoDb.js.
let rows;
const SORT_KEYS = { dictionary_projects: "item_key", dictionary_cards: "card_id" };
const keyOf = (table, item) => `${table}|${item.user_name}|${item[SORT_KEYS[table]]}`;
const done = (value) => ({ promise: async () => value });

const fake = {
    get: ({ TableName, Key }) => done({ Item: rows.get(keyOf(TableName, Key)) }),
    put: ({ TableName, Item }) => { rows.set(keyOf(TableName, Item), { ...Item }); return done({}); },
    // "SET a = :x, #b = :y [REMOVE #c]" updates, which is all projects.js uses.
    update: ({ TableName, Key, UpdateExpression, ExpressionAttributeNames = {}, ExpressionAttributeValues = {}, ConditionExpression }) => {
        const existing = rows.get(keyOf(TableName, Key));
        if (ConditionExpression && !existing) return { promise: async () => { throw Object.assign(new Error("ConditionalCheckFailed"), { name: "ConditionalCheckFailedException" }); } };
        const row = { ...(existing || Key) };
        const [setPart, removePart] = UpdateExpression.split(" REMOVE ");
        setPart.replace(/^SET /, "").split(",").forEach((part) => {
            const [lhs, rhs] = part.split("=").map((x) => x.trim());
            row[ExpressionAttributeNames[lhs] || lhs] = ExpressionAttributeValues[rhs];
        });
        if (removePart) removePart.split(",").forEach((name) => { delete row[ExpressionAttributeNames[name.trim()] || name.trim()]; });
        rows.set(keyOf(TableName, Key), row);
        return done({});
    },
    query: ({ TableName, ExpressionAttributeValues: v }) => {
        const sk = SORT_KEYS[TableName];
        const Items = [...rows.entries()]
            .filter(([key, r]) => key.startsWith(`${TableName}|`)
                && r.user_name === v[":u"] && (!v[":p"] || String(r[sk]).startsWith(v[":p"])))
            .map(([, r]) => r);
        return done({ Items });
    },
    batchWrite: ({ RequestItems }) => {
        Object.entries(RequestItems).forEach(([table, requests]) => requests.forEach((r) => rows.delete(keyOf(table, r.DeleteRequest.Key))));
        return done({});
    },
    batchGet: ({ RequestItems }) => {
        const Responses = {};
        Object.entries(RequestItems).forEach(([table, { Keys }]) => {
            Responses[table] = Keys.map((k) => rows.get(keyOf(table, k))).filter(Boolean);
        });
        return done({ Responses });
    },
};
database.dynamoDbClientInstance = () => fake;

const projects = require("../projects");

const USER = "tester";
const MON = "2026-11-16";

beforeEach(() => { rows = new Map(); });

/** Expects a ProjectError with this status. */
async function refuses(promise, status) {
    await assert.rejects(promise, (err) => err instanceof projects.ProjectError && err.status === status);
}

test("cleanTask: a task that waits for nothing needs a start", () => {
    assert.throws(() => projects.cleanTask({ name: "Plan", days: 5 }), /start date/);
    const t = projects.cleanTask({ name: " Plan ", days: 5, start: MON, who: " Mike ", notes: [{ type: "card", id: "n1" }, { type: "card", id: "n1" }] });
    assert.deepEqual(t, { name: "Plan", days: 5, after: [], start: MON, who: "Mike", notes: [{ type: "card", id: "n1" }], order: 0 });
});

test("cleanTask: a waiting task has no start of its own", () => {
    const t = projects.cleanTask({ name: "Pick", days: 3, after: ["a", "a"], start: MON });
    assert.deepEqual(t.after, ["a"]);
    assert.equal(t.start, null);
});

test("cleanTask: refuses bad days, dates and links", () => {
    assert.throws(() => projects.cleanTask({ name: "x", days: 0, start: MON }), /Days/);
    assert.throws(() => projects.cleanTask({ name: "x", days: 2.5, start: MON }), /Days/);
    assert.throws(() => projects.cleanTask({ name: "x", days: 1, start: "2026-02-30" }), /start date/);
    assert.throws(() => projects.cleanTask({ name: "", days: 1, start: MON }), /name/);
    assert.throws(() => projects.cleanTask({ name: "x", days: 1, start: MON, notes: [{ type: "web", id: "1" }] }), /note/);
    assert.throws(() => projects.cleanTask({ name: "x", days: 1, after: ["bad id!"] }), /Waits for/);
});

test("makesLoop", () => {
    const tasks = [{ id: "a", after: [] }, { id: "b", after: ["a"] }];
    assert.equal(projects.makesLoop(tasks, "a", ["b"]), true);
    assert.equal(projects.makesLoop(tasks, "b", ["a"]), false);
});

test("projects: make, rename, list", async () => {
    const p = await projects.createProject(USER, { name: "Kitchen remodel" });
    assert.equal(p.name, "Kitchen remodel");
    await projects.renameProject(USER, p.id, { name: "Kitchen" });
    const all = await projects.listAll(USER);
    assert.deepEqual(all.projects.map((x) => x.name), ["Kitchen"]);
    await refuses(projects.renameProject(USER, "nope", { name: "x" }), 404);
    // Someone else sees nothing.
    assert.deepEqual((await projects.listAll("someone-else")).projects, []);
});

test("tasks: waits for, order, loops refused", async () => {
    const p = await projects.createProject(USER, { name: "Kitchen" });
    const plan = await projects.createTask(USER, p.id, { name: "Plan", days: 5, start: MON });
    const pick = await projects.createTask(USER, p.id, { name: "Pick", days: 3, after: [plan.id] });
    assert.equal(plan.order, 1);
    assert.equal(pick.order, 2);
    assert.equal(pick.start, null);

    // Plan can't wait for Pick: Pick already waits for Plan.
    await refuses(projects.updateTask(USER, p.id, plan.id, { name: "Plan", days: 5, after: [pick.id] }), 400);
    // Can't wait for itself, or for a task that isn't in the project.
    await refuses(projects.updateTask(USER, p.id, pick.id, { name: "Pick", days: 3, after: [pick.id] }), 400);
    const other = await projects.createProject(USER, { name: "Other" });
    const elsewhere = await projects.createTask(USER, other.id, { name: "X", days: 1, start: MON });
    await refuses(projects.createTask(USER, p.id, { name: "Y", days: 1, after: [elsewhere.id] }), 400);

    const updated = await projects.updateTask(USER, p.id, pick.id, { name: "Pick cabinets", days: 4, after: [plan.id], who: "Me", order: 2 });
    assert.equal(updated.name, "Pick cabinets");
    assert.equal(updated.who, "Me");
});

test("deleting a task: waiting tasks keep the start the web app sends", async () => {
    const p = await projects.createProject(USER, { name: "Kitchen" });
    const a = await projects.createTask(USER, p.id, { name: "A", days: 5, start: MON });
    const c = await projects.createTask(USER, p.id, { name: "C", days: 1, start: MON });
    const b = await projects.createTask(USER, p.id, { name: "B", days: 2, after: [a.id] });
    const d = await projects.createTask(USER, p.id, { name: "D", days: 1, after: [a.id, c.id] });

    const { changed } = await projects.deleteTask(USER, p.id, a.id, { [b.id]: "2026-11-23" });
    const byId = Object.fromEntries(changed.map((t) => [t.id, t]));
    assert.deepEqual(byId[b.id].after, []);
    assert.equal(byId[b.id].start, "2026-11-23");
    assert.deepEqual(byId[d.id].after, [c.id]);
    assert.equal(byId[d.id].start, null);
    const left = (await projects.listAll(USER)).tasks.map((t) => t.name).sort();
    assert.deepEqual(left, ["B", "C", "D"]);
});

test("deleting a project deletes its tasks, not other projects'", async () => {
    const p = await projects.createProject(USER, { name: "Kitchen" });
    const q = await projects.createProject(USER, { name: "Taxes" });
    await projects.createTask(USER, p.id, { name: "A", days: 1, start: MON });
    await projects.createTask(USER, q.id, { name: "B", days: 1, start: MON });
    await projects.deleteProject(USER, p.id);
    const all = await projects.listAll(USER);
    assert.deepEqual(all.projects.map((x) => x.name), ["Taxes"]);
    assert.deepEqual(all.tasks.map((t) => t.name), ["B"]);
});

test("linked notes come with titles; deleted notes drop off", async () => {
    rows.set(`dictionary_cards|${USER}|n1`, { user_name: USER, card_id: "n1", title: "Cabinet quotes" });
    const p = await projects.createProject(USER, { name: "Kitchen" });
    await projects.createTask(USER, p.id, {
        name: "Order", days: 1, start: MON,
        notes: [{ type: "card", id: "n1" }, { type: "card", id: "deleted" }, { type: "word", id: "hola" }],
    });
    const [task] = (await projects.listAll(USER)).tasks;
    assert.deepEqual(task.notes, [
        { type: "card", id: "n1", title: "Cabinet quotes" },
        { type: "word", id: "hola", title: "hola" },
    ]);
});

test("cleanLayout keeps only sensible widths and foldable columns", () => {
    assert.deepEqual(projects.cleanLayout({
        widths: { name: 20, who: 180.4, days: 9999, bogus: 50 },
        folded: ["who", "name", "who", "nope"],
        tableFolded: "yes",
    }), { widths: { name: 100, who: 180, days: 600 }, folded: ["who"], tableFolded: false });
    assert.deepEqual(projects.cleanLayout(null), { widths: {}, folded: [], tableFolded: false });
});

test("the layout is saved on the account and comes back with GET /projects", async () => {
    assert.deepEqual((await projects.listAll(USER)).layout, { widths: {}, folded: [], tableFolded: false });
    await projects.setLayout(USER, { widths: { who: 120 }, folded: ["days"], tableFolded: true });
    assert.deepEqual((await projects.listAll(USER)).layout, { widths: { who: 120 }, folded: ["days"], tableFolded: true });
});

// ---- Groups and order --------------------------------------------------------

/** A project with tasks A, B, C (C waits for A). */
async function abc() {
    const p = await projects.createProject(USER, { name: "Kitchen" });
    const a = await projects.createTask(USER, p.id, { name: "A", days: 2, start: MON });
    const b = await projects.createTask(USER, p.id, { name: "B", days: 1, start: MON });
    const c = await projects.createTask(USER, p.id, { name: "C", days: 1, after: [a.id] });
    return { p, a, b, c };
}

test("new tasks and groups go at the end of the project's list", async () => {
    const { p, a, b, c } = await abc();
    assert.deepEqual([a.order, b.order, c.order], [1, 2, 3]);
    assert.equal(a.group, null);
    const made = await projects.createGroup(USER, p.id, { name: "Cabinets" });
    assert.equal(made.group.order, 4);
    const d = await projects.createTask(USER, p.id, { name: "D", days: 1, start: MON });
    assert.equal(d.order, 5);
    assert.deepEqual((await projects.listAll(USER)).groups.map((g) => g.name), ["Cabinets"]);
});

test("arrange puts tasks in a group and keeps them there when the task is edited", async () => {
    const { p, a, b, c } = await abc();
    const { group } = await projects.createGroup(USER, p.id, { name: "Cabinets" });
    const state = await projects.arrange(USER, p.id, {
        groups: [{ id: group.id, order: 1 }],
        tasks: [{ id: b.id, group: null, order: 2 }, { id: a.id, group: group.id, order: 1 }, { id: c.id, group: group.id, order: 2 }],
    });
    const byId = Object.fromEntries(state.tasks.map((t) => [t.id, t]));
    assert.equal(byId[a.id].group, group.id);
    assert.equal(byId[c.id].order, 2);
    assert.equal(state.groups[0].order, 1);
    // Editing a task in the window doesn't move it out of its group.
    const edited = await projects.updateTask(USER, p.id, a.id, { name: "A!", days: 3, start: MON, order: 99 });
    assert.equal(edited.group, group.id);
    assert.equal(edited.order, 1);
    // Unknown tasks or groups are refused.
    await refuses(projects.arrange(USER, p.id, { tasks: [{ id: a.id, group: "nope", order: 1 }] }), 400);
    await refuses(projects.arrange(USER, p.id, { tasks: [{ id: "nope", group: null, order: 1 }] }), 400);
});

test("taking a task out of its group removes the group from the task", async () => {
    const { p, a } = await abc();
    const { group } = await projects.createGroup(USER, p.id, { name: "G" });
    await projects.arrange(USER, p.id, { tasks: [{ id: a.id, group: group.id, order: 1 }] });
    const state = await projects.arrange(USER, p.id, { tasks: [{ id: a.id, group: null, order: 5 }] });
    assert.equal(state.tasks.find((t) => t.id === a.id).group, null);
});

test("ungroup keeps the tasks, in the group's place", async () => {
    const { p, a, b, c } = await abc();
    const { group } = await projects.createGroup(USER, p.id, { name: "G" });
    // List: B, G(A, C)
    await projects.arrange(USER, p.id, {
        groups: [{ id: group.id, order: 2 }],
        tasks: [{ id: b.id, group: null, order: 1 }, { id: a.id, group: group.id, order: 1 }, { id: c.id, group: group.id, order: 2 }],
    });
    const state = await projects.ungroup(USER, p.id, group.id);
    assert.deepEqual(state.groups, []);
    assert.deepEqual(state.tasks.map((t) => [t.name, t.order, t.group]), [["B", 1, null], ["A", 2, null], ["C", 3, null]]);
});

test("renaming a group; deleting a project deletes its groups", async () => {
    const { p } = await abc();
    const { group } = await projects.createGroup(USER, p.id, { name: "G" });
    const renamed = await projects.renameGroup(USER, p.id, group.id, { name: "Finishing" });
    assert.equal(renamed.groups[0].name, "Finishing");
    await refuses(projects.renameGroup(USER, p.id, "nope", { name: "x" }), 404);
    await projects.deleteProject(USER, p.id);
    assert.deepEqual((await projects.listAll(USER)).groups, []);
});

test("deleting a task keeps the group of the tasks that waited for it", async () => {
    const { p, a, c } = await abc();
    const { group } = await projects.createGroup(USER, p.id, { name: "G" });
    await projects.arrange(USER, p.id, { tasks: [{ id: c.id, group: group.id, order: 1 }] });
    const { changed } = await projects.deleteTask(USER, p.id, a.id, { [c.id]: "2026-11-18" });
    assert.equal(changed[0].group, group.id);
});

// ---- Holidays ---------------------------------------------------------------

test("cleanHolidays: real dates, one per date, sorted, names trimmed", () => {
    assert.deepEqual(projects.cleanHolidays([
        { date: "2026-12-25", name: " Christmas " }, "2026-11-26", { date: "2026-12-25", name: "Xmas" },
    ]), [{ date: "2026-11-26", name: "" }, { date: "2026-12-25", name: "Xmas" }]);
    assert.throws(() => projects.cleanHolidays([{ date: "2026-02-30" }]), /real date/);
    assert.throws(() => projects.cleanHolidays("nope"), /list/);
});

test("holidays are kept on the account and come back with GET /projects", async () => {
    assert.deepEqual((await projects.listAll(USER)).holidays, []);
    await projects.setHolidays(USER, [{ date: "2026-12-25", name: "Christmas" }]);
    assert.deepEqual((await projects.listAll(USER)).holidays, [{ date: "2026-12-25", name: "Christmas" }]);
});
