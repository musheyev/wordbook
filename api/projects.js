// My Projects: the user's projects and their tasks, shown as a Gantt chart
// (a timeline with one bar per task). Desktop only; just for the user.
//
// Everything lives in one table, `dictionary_projects`, one row per project
// and one per task, all under the user's name:
//
//   user_name  item_key                      what
//   ---------  ----------------------------  --------------------------------
//   rudy       project#<projectId>           { name, created_at, updated_at }
//   rudy       task#<projectId>#<taskId>     { name, days, start, after, who,
//                                              notes, order, group, … }
//   rudy       group#<projectId>#<groupId>   { name, order }
//
// Groups: a project's tasks can be put in named groups, which fold on the
// chart. The project's list is groups and ungrouped tasks, each with an
// `order` (one numbering for that list); a task in a group has an `order`
// within its group instead. Order and groups never change a task's dates.
//
// Why one table with two kinds of row: a single query (all rows for the
// user) loads every project and task at once, which is what the "All
// projects" page needs. The `task#<projectId>#` prefix also lets us find one
// project's tasks with `begins_with`, when deleting that project.
//
// A task's fields:
//   name    what it is ("Order cabinets")
//   days    how long it takes, in workdays (weekends don't count)
//   after   ids of tasks in the same project it waits for ("waits for")
//   start   "YYYY-MM-DD", only for a task that waits for nothing. A task
//           that waits for others has no stored start: it starts the
//           workday after the last of them ends. The web app works that out
//           each time it draws the chart (utils/projectSchedule.js), so
//           changing one task moves every task after it, with nothing saved.
//   who     one person's name, typed by the user ("" = nobody). People are
//           just names; they aren't Wordbook users and get no emails.
//   notes   linked notes and words, [{ type: "card"|"word", id }]; optional
//   order   the row's place in the project's list
//
// Offline (decided): the web app can work on projects with no connection and
// send the changes later. Two things make that safe here:
// - New projects, tasks and groups can come with an id the web app made
//   (`id`). Sending the same "make" twice returns what's there instead of
//   making a second one, so a change sent again after a dropped connection
//   is harmless.
// - A change made offline says when it was made (`changedAt`). If the
//   stored task, group or project was changed after that (on another
//   computer, say), the stored one is newer and is kept: the latest change
//   wins (decided, like notes). The answer says which was kept:
//   `kept: "yours"` or `kept: "theirs"`.
//
// The server's own job is to keep the data sound: names and numbers in
// range, "waits for" only on tasks of the same project, and no loops (A waits
// for B, B waits for A: neither could ever start).
const crypto = require("crypto");
const database = require("./dynamoDb");
const { noteTitles } = require("./note-links");

const TABLE = "dictionary_projects";

const MAX_PROJECTS = 200;
const MAX_TASKS = 500;          // per project
const MAX_GROUPS = 200;         // per project
const MAX_NAME = 200;
const MAX_WHO = 80;
const MAX_DAYS = 999;
const MAX_NOTES = 50;           // linked notes on one task
const MAX_NOTE_ID = 300;

/** A refusal with a status code and a message for the user. */
class ProjectError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const db = () => database.dynamoDbClientInstance();
const projectKey = (projectId) => `project#${projectId}`;
const taskKey = (projectId, taskId) => `task#${projectId}#${taskId}`;
const groupKey = (projectId, groupId) => `group#${projectId}#${groupId}`;
const newId = () => crypto.randomUUID();

/**
 * When an offline change was made, as an ISO time, or null for a change made
 * online (that one always applies).
 */
function changedAtOf(body) {
    const value = body && body.changedAt;
    if (value == null || value === "") return null;
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) throw new ProjectError(400, "That change has no proper time.");
    return time.toISOString();
}

/** Latest wins: was the stored row changed after this offline change? */
const changedSince = (row, changedAt) => !!(changedAt && row.updated_at && row.updated_at > changedAt);

/** Ids we made (UUIDs); anything else in a URL is refused before it reaches a key. */
const isId = (id) => typeof id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(id);

function checkId(id, what) {
    if (!isId(id)) throw new ProjectError(400, `That ${what} wasn't found.`);
    return id;
}

/** The id the web app made for something new (offline), or a new one. */
function idFor(body, what) {
    if (!body || body.id == null) return newId();
    if (!isId(body.id) || body.id.length < 8) throw new ProjectError(400, `That ${what} needs a proper id.`);
    return body.id;
}

/** A calendar date as "YYYY-MM-DD" that really exists (no Feb 30). */
function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** A project's name, trimmed; refuses an empty or very long one. */
function cleanName(name, what) {
    const text = typeof name === "string" ? name.trim() : "";
    if (!text) throw new ProjectError(400, `Give the ${what} a name.`);
    if (text.length > MAX_NAME) throw new ProjectError(400, `A ${what} name can be up to ${MAX_NAME} characters.`);
    return text;
}

/**
 * Checks a task as sent by the web app and returns the fields to store.
 * Pure (no database), so it can be tested on its own.
 *
 * @param {object} input { name, days, after, start, who, notes, order }
 * @returns {{name: string, days: number, after: string[], start: string|null,
 *            who: string, notes: Array<{type: string, id: string}>, order: number}}
 */
function cleanTask(input) {
    const body = input && typeof input === "object" ? input : {};
    const name = cleanName(body.name, "task");

    const days = Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        throw new ProjectError(400, `Days must be a whole number from 1 to ${MAX_DAYS}.`);
    }

    const afterList = body.after == null ? [] : body.after;
    if (!Array.isArray(afterList) || afterList.some((id) => !isId(id))) {
        throw new ProjectError(400, "“Waits for” must list tasks of this project.");
    }
    const after = [...new Set(afterList)];

    // Only a task that waits for nothing has a start of its own.
    let start = null;
    if (!after.length) {
        if (!isDate(body.start)) throw new ProjectError(400, "Choose a start date.");
        start = body.start;
    }

    const who = typeof body.who === "string" ? body.who.trim() : "";
    if (who.length > MAX_WHO) throw new ProjectError(400, `A name can be up to ${MAX_WHO} characters.`);

    const noteList = body.notes == null ? [] : body.notes;
    if (!Array.isArray(noteList) || noteList.length > MAX_NOTES) {
        throw new ProjectError(400, `A task can link to up to ${MAX_NOTES} notes.`);
    }
    const seen = new Set();
    const notes = [];
    for (const note of noteList) {
        const type = note && note.type;
        const id = note && typeof note.id === "string" ? (type === "word" ? note.id.trim() : note.id) : "";
        if (!["card", "word"].includes(type) || !id || id.length > MAX_NOTE_ID) {
            throw new ProjectError(400, "Choose a note or a word to link.");
        }
        const key = `${type}#${id}`;
        if (!seen.has(key)) { seen.add(key); notes.push({ type, id }); }
    }

    const order = Number.isFinite(Number(body.order)) ? Number(body.order) : 0;
    return { name, days, after, start, who, notes, order };
}

/**
 * Would saving `taskId` with these `after` ids make a loop? Follows "waits
 * for" from each of them; if the trail comes back to `taskId`, it would.
 * Pure, so it can be tested on its own.
 *
 * @param {Array<{id: string, after: string[]}>} tasks the project's tasks as stored
 * @param {string} taskId the task being saved
 * @param {string[]} after what it would wait for
 * @returns {boolean}
 */
function makesLoop(tasks, taskId, after) {
    const waitsFor = new Map(tasks.map((t) => [t.id, t.after || []]));
    waitsFor.set(taskId, after);
    const seen = new Set();
    const stack = [...after];
    while (stack.length) {
        const id = stack.pop();
        if (id === taskId) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...(waitsFor.get(id) || []));
    }
    return false;
}

/** Every row of the user's (projects and tasks), page by page. */
async function readRows(userName, prefix) {
    const rows = [];
    let start;
    do {
        const page = await db().query({
            TableName: TABLE,
            KeyConditionExpression: prefix ? "user_name = :u AND begins_with(item_key, :p)" : "user_name = :u",
            ExpressionAttributeValues: prefix ? { ":u": userName, ":p": prefix } : { ":u": userName },
            ExclusiveStartKey: start,
        }).promise();
        rows.push(...(page.Items || []));
        start = page.LastEvaluatedKey;
    } while (start);
    return rows;
}

/** A stored task row as the web app sees it. */
const taskOut = (row) => ({
    id: row.task_id,
    projectId: row.project_id,
    name: row.name,
    days: row.days,
    after: row.after || [],
    start: row.start || null,
    who: row.who || "",
    notes: row.notes || [],
    order: row.order || 0,
    group: row.group || null,
});

/** A stored group row as the web app sees it. */
const groupOut = (row) => ({ id: row.group_id, projectId: row.project_id, name: row.name, order: row.order || 0 });

const projectOut = (row) => ({ id: row.project_id, name: row.name, created_at: row.created_at });

async function getProjectRow(userName, projectId) {
    const data = await db().get({ TableName: TABLE, Key: { user_name: userName, item_key: projectKey(projectId) } }).promise();
    if (!data.Item) throw new ProjectError(404, "That project wasn't found.");
    return data.Item;
}

/** One project's tasks as stored rows. */
const projectTaskRows = (userName, projectId) => readRows(userName, `task#${projectId}#`);
/** One project's groups as stored rows. */
const projectGroupRows = (userName, projectId) => readRows(userName, `group#${projectId}#`);

/**
 * Each linked note with its title now; notes deleted since are left out
 * (the link quietly goes away). Changes the tasks given.
 */
async function addNoteTitles(userName, tasks) {
    const cardIds = [...new Set(tasks.flatMap((t) => t.notes.filter((n) => n.type === "card").map((n) => n.id)))];
    const titles = cardIds.length ? await noteTitles(userName, cardIds) : {};
    tasks.forEach((t) => {
        t.notes = t.notes
            .filter((n) => n.type === "word" || n.id in titles)
            .map((n) => ({ ...n, title: n.type === "card" ? titles[n.id] : n.id }));
    });
    return tasks;
}

/**
 * All the user's projects and tasks, and the table's column layout
 * (GET /projects). Projects oldest first;
 * tasks in their order. Each linked note comes with its title now; notes
 * deleted since are left out (the link quietly goes away).
 *
 * @param {string} userName
 * @returns {Promise<{projects: object[], tasks: object[], groups: object[], layout: object, holidays: object[]}>}
 */
async function listAll(userName) {
    const rows = await readRows(userName);
    const projects = rows.filter((r) => r.item_key.startsWith("project#")).map(projectOut)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const tasks = rows.filter((r) => r.item_key.startsWith("task#")).map(taskOut)
        .sort((a, b) => a.order - b.order);
    const groups = rows.filter((r) => r.item_key.startsWith("group#")).map(groupOut)
        .sort((a, b) => a.order - b.order);
    await addNoteTitles(userName, tasks);
    const [layout, holidays] = await Promise.all([getLayout(userName), getHolidays(userName)]);
    return { projects, tasks, groups, layout, holidays };
}

/** One project's tasks and groups, as the web app gets them after a change to its groups or order. */
async function projectState(userName, projectId) {
    const [taskRows, groupRows] = await Promise.all([projectTaskRows(userName, projectId), projectGroupRows(userName, projectId)]);
    const tasks = await addNoteTitles(userName, taskRows.map(taskOut).sort((a, b) => a.order - b.order));
    return { projectId, tasks, groups: groupRows.map(groupOut).sort((a, b) => a.order - b.order) };
}

/** Make a project (POST /projects). */
async function createProject(userName, body) {
    const name = cleanName(body && body.name, "project");
    const projectId = idFor(body, "project");
    // Sent again (a dropped connection): it's there already.
    const existing = await db().get({ TableName: TABLE, Key: { user_name: userName, item_key: projectKey(projectId) } }).promise();
    if (existing.Item) return projectOut(existing.Item);
    const rows = await readRows(userName, "project#");
    if (rows.length >= MAX_PROJECTS) throw new ProjectError(413, `You can have up to ${MAX_PROJECTS} projects.`);
    const now = new Date().toISOString();
    const row = { user_name: userName, item_key: projectKey(projectId), project_id: projectId, name, created_at: now, updated_at: now };
    await db().put({ TableName: TABLE, Item: row }).promise();
    return projectOut(row);
}

/** Rename a project (PUT /projects/:projectId). */
async function renameProject(userName, projectId, body) {
    checkId(projectId, "project");
    const name = cleanName(body && body.name, "project");
    const changedAt = changedAtOf(body);
    const row = await getProjectRow(userName, projectId);
    if (changedSince(row, changedAt)) return { ...projectOut(row), kept: "theirs" };
    await db().update({
        TableName: TABLE,
        Key: { user_name: userName, item_key: projectKey(projectId) },
        UpdateExpression: "SET #n = :n, updated_at = :t",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":n": name, ":t": new Date().toISOString() },
    }).promise();
    return { ...projectOut({ ...row, name }), ...(changedAt ? { kept: "yours" } : {}) };
}

/** Delete rows by key, 25 at a time (DynamoDB's batch limit), retrying leftovers. */
async function deleteKeys(userName, itemKeys) {
    for (let i = 0; i < itemKeys.length; i += 25) {
        let requests = itemKeys.slice(i, i + 25).map((item_key) => ({ DeleteRequest: { Key: { user_name: userName, item_key } } }));
        for (let tries = 0; requests && requests.length && tries < 5; tries++) {
            const res = await db().batchWrite({ RequestItems: { [TABLE]: requests } }).promise();
            requests = res.UnprocessedItems && res.UnprocessedItems[TABLE];
        }
        if (requests && requests.length) throw new Error("Some rows could not be deleted.");
    }
}

/**
 * Delete a project and all its tasks (DELETE /projects/:projectId). The web
 * app asks the user first. Linked notes stay as they are.
 */
async function deleteProject(userName, projectId) {
    checkId(projectId, "project");
    await getProjectRow(userName, projectId);
    const taskRows = await projectTaskRows(userName, projectId);
    const groupRows = await projectGroupRows(userName, projectId);
    // Tasks and groups first, the project last: if this stops halfway, the
    // project is still there to delete again.
    await deleteKeys(userName, [...taskRows, ...groupRows].map((r) => r.item_key));
    await deleteKeys(userName, [projectKey(projectId)]);
}

/** Checks "waits for": tasks of this project, not itself, no loop. */
function checkAfter(tasks, taskId, after) {
    const ids = new Set(tasks.map((t) => t.id));
    if (after.includes(taskId)) throw new ProjectError(400, "A task can't wait for itself.");
    if (after.some((id) => !ids.has(id))) throw new ProjectError(400, "“Waits for” must list tasks of this project.");
    if (makesLoop(tasks, taskId, after)) {
        throw new ProjectError(400, "That would make a loop: these tasks would wait for each other and never start.");
    }
}

/** Store a task row (new or changed). */
async function putTask(userName, projectId, taskId, fields, createdAt) {
    const now = new Date().toISOString();
    const row = {
        user_name: userName,
        item_key: taskKey(projectId, taskId),
        project_id: projectId,
        task_id: taskId,
        ...fields,
        created_at: createdAt || now,
        updated_at: now,
    };
    if (row.start == null) delete row.start;
    if (!row.group) delete row.group;
    await db().put({ TableName: TABLE, Item: row }).promise();
    return row;
}

/** Add a task to a project (POST /projects/:projectId/tasks). */
async function createTask(userName, projectId, body) {
    checkId(projectId, "project");
    const fields = cleanTask(body);
    await getProjectRow(userName, projectId);
    const taskId = idFor(body, "task");
    const rows = await projectTaskRows(userName, projectId);
    // Sent again (a dropped connection): it's there already.
    const already = rows.find((r) => r.task_id === taskId);
    if (already) return taskOut(already);
    const tasks = rows.map(taskOut);
    if (tasks.length >= MAX_TASKS) throw new ProjectError(413, `A project can have up to ${MAX_TASKS} tasks.`);
    checkAfter(tasks, taskId, fields.after);
    // A new task goes at the end of the project's list, in no group.
    const groups = (await projectGroupRows(userName, projectId)).map(groupOut);
    fields.group = null;
    fields.order = topLevelMax(tasks, groups) + 1;
    return taskOut(await putTask(userName, projectId, taskId, fields));
}

/** Change a task (PUT /projects/:projectId/tasks/:taskId): the whole task is sent. */
async function updateTask(userName, projectId, taskId, body) {
    checkId(projectId, "project");
    checkId(taskId, "task");
    const fields = cleanTask(body);
    const rows = await projectTaskRows(userName, projectId);
    const old = rows.find((r) => r.task_id === taskId);
    if (!old) throw new ProjectError(404, "That task wasn't found.");
    const changedAt = changedAtOf(body);
    if (changedSince(old, changedAt)) return { ...taskOut(old), kept: "theirs" };
    checkAfter(rows.map(taskOut), taskId, fields.after);
    // Its place and group only change by arranging (PUT …/arrange).
    fields.order = old.order || 0;
    fields.group = old.group || null;
    const saved = taskOut(await putTask(userName, projectId, taskId, fields, old.created_at));
    return changedAt ? { ...saved, kept: "yours" } : saved;
}

/**
 * Delete a task (DELETE /projects/:projectId/tasks/:taskId). Tasks that
 * waited for it stop waiting for it. One that then waits for nothing keeps
 * the start it had: the web app works those dates out and sends them as
 * `starts` ({ taskId: "YYYY-MM-DD" }). Without one, it starts where the
 * deleted task started.
 *
 * @param {string} [changedAtValue] when it was deleted, for a delete made offline
 * @returns {Promise<{changed: object[], kept?: string}>} the tasks that changed because of it
 */
async function deleteTask(userName, projectId, taskId, starts, changedAtValue) {
    checkId(projectId, "project");
    checkId(taskId, "task");
    const given = starts && typeof starts === "object" ? starts : {};
    const changedAt = changedAtOf({ changedAt: changedAtValue });
    const rows = await projectTaskRows(userName, projectId);
    const gone = rows.find((r) => r.task_id === taskId);
    // Deleted already (sent again, or deleted elsewhere too): nothing to do.
    if (!gone) {
        if (changedAt) return { changed: [], kept: "yours" };
        throw new ProjectError(404, "That task wasn't found.");
    }
    // Deleted offline, but changed elsewhere after that: the change is newer, so the task stays.
    if (changedSince(gone, changedAt)) return { changed: [], kept: "theirs", task: taskOut(gone) };

    const changed = [];
    for (const row of rows) {
        if (row.task_id === taskId || !(row.after || []).includes(taskId)) continue;
        const fields = { ...taskOut(row) };
        fields.after = fields.after.filter((id) => id !== taskId);
        if (!fields.after.length) {
            const start = given[row.task_id];
            fields.start = isDate(start) ? start : (gone.start || new Date().toISOString().slice(0, 10));
        }
        const { name, days, after, start, who, notes, order, group } = fields;
        changed.push(taskOut(await putTask(userName, projectId, row.task_id, { name, days, after, start, who, notes, order, group }, row.created_at)));
    }
    await deleteKeys(userName, [gone.item_key]);
    return { changed };
}

// ---- Groups and order ---------------------------------------------------------

/** The highest `order` in the project's own list (ungrouped tasks and groups). */
function topLevelMax(tasks, groups) {
    const groupIds = new Set(groups.map((g) => g.id));
    return Math.max(0,
        ...groups.map((g) => g.order || 0),
        ...tasks.filter((t) => !t.group || !groupIds.has(t.group)).map((t) => t.order || 0));
}

async function getGroupRow(userName, projectId, groupId) {
    const data = await db().get({ TableName: TABLE, Key: { user_name: userName, item_key: groupKey(projectId, groupId) } }).promise();
    if (!data.Item) throw new ProjectError(404, "That group wasn't found.");
    return data.Item;
}

/**
 * Make a group (POST /projects/:projectId/groups), at the end of the
 * project's list. Tasks go in it by arranging.
 * @returns {Promise<{projectId, tasks, groups, group}>} the project as it is now, and the new group
 */
async function createGroup(userName, projectId, body) {
    checkId(projectId, "project");
    const name = cleanName(body && body.name, "group");
    await getProjectRow(userName, projectId);
    const [taskRows, groupRows] = await Promise.all([projectTaskRows(userName, projectId), projectGroupRows(userName, projectId)]);
    const groupId = idFor(body, "group");
    // Sent again (a dropped connection): it's there already.
    const already = groupRows.find((r) => r.group_id === groupId);
    if (already) return { ...(await projectState(userName, projectId)), group: groupOut(already) };
    if (groupRows.length >= MAX_GROUPS) throw new ProjectError(413, `A project can have up to ${MAX_GROUPS} groups.`);
    const now = new Date().toISOString();
    const row = {
        user_name: userName, item_key: groupKey(projectId, groupId), project_id: projectId, group_id: groupId,
        name, order: topLevelMax(taskRows.map(taskOut), groupRows.map(groupOut)) + 1, created_at: now, updated_at: now,
    };
    await db().put({ TableName: TABLE, Item: row }).promise();
    return { ...(await projectState(userName, projectId)), group: groupOut(row) };
}

/** Rename a group (PUT /projects/:projectId/groups/:groupId). */
async function renameGroup(userName, projectId, groupId, body) {
    checkId(projectId, "project");
    checkId(groupId, "group");
    const name = cleanName(body && body.name, "group");
    const changedAt = changedAtOf(body);
    const row = await getGroupRow(userName, projectId, groupId);
    if (changedSince(row, changedAt)) return { ...(await projectState(userName, projectId)), kept: "theirs" };
    await db().update({
        TableName: TABLE,
        Key: { user_name: userName, item_key: groupKey(projectId, groupId) },
        UpdateExpression: "SET #n = :n, updated_at = :t",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":n": name, ":t": new Date().toISOString() },
    }).promise();
    return { ...(await projectState(userName, projectId)), ...(changedAt ? { kept: "yours" } : {}) };
}

/** Set a task's or group's place (and a task's group) without touching anything else. */
async function setPlace(userName, itemKey, order, group) {
    const names = { "#o": "order" };
    const values = { ":o": order, ":t": new Date().toISOString() };
    let expression = "SET #o = :o, updated_at = :t";
    if (group !== undefined) {
        names["#g"] = "group";
        if (group) { values[":g"] = group; expression += ", #g = :g"; } else { expression += " REMOVE #g"; }
    }
    await db().update({
        TableName: TABLE,
        Key: { user_name: userName, item_key: itemKey },
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(item_key)",
    }).promise();
}

/**
 * Ungroup (DELETE /projects/:projectId/groups/:groupId): the group goes; its
 * tasks stay, in the project's list where the group was, in their order.
 */
async function ungroup(userName, projectId, groupId) {
    checkId(projectId, "project");
    checkId(groupId, "group");
    await getGroupRow(userName, projectId, groupId);
    const state = await projectState(userName, projectId);
    const groupIds = new Set(state.groups.map((g) => g.id));
    const top = [
        ...state.groups.map((g) => ({ type: "group", id: g.id, order: g.order })),
        ...state.tasks.filter((t) => !t.group || !groupIds.has(t.group)).map((t) => ({ type: "task", id: t.id, order: t.order })),
    ].sort((a, b) => a.order - b.order);
    const members = state.tasks.filter((t) => t.group === groupId).sort((a, b) => a.order - b.order);
    const list = top.flatMap((item) => (item.type === "group" && item.id === groupId
        ? members.map((t) => ({ type: "task", id: t.id, order: t.order, wasIn: true }))
        : [item]));
    for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        const order = i + 1;
        if (item.order === order && !item.wasIn) continue;
        const key = item.type === "group" ? groupKey(projectId, item.id) : taskKey(projectId, item.id);
        await setPlace(userName, key, order, item.type === "task" ? null : undefined);
    }
    await deleteKeys(userName, [groupKey(projectId, groupId)]);
    return projectState(userName, projectId);
}

/**
 * Checks an arrangement as sent by the web app. Pure.
 * @param {{groups?: Array<{id, order}>, tasks?: Array<{id, group, order}>}} body
 * @param {string[]} taskIds the project's tasks
 * @param {string[]} groupIds the project's groups
 */
function cleanArrangement(body, taskIds, groupIds) {
    const input = body && typeof body === "object" ? body : {};
    const known = { task: new Set(taskIds), group: new Set(groupIds) };
    const order = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new ProjectError(400, "Each place needs a number.");
        return n;
    };
    const groups = (Array.isArray(input.groups) ? input.groups : []).map((g) => {
        if (!g || !known.group.has(g.id)) throw new ProjectError(400, "That group isn't in this project.");
        return { id: g.id, order: order(g.order) };
    });
    const tasks = (Array.isArray(input.tasks) ? input.tasks : []).map((t) => {
        if (!t || !known.task.has(t.id)) throw new ProjectError(400, "That task isn't in this project.");
        const group = t.group == null || t.group === "" ? null : t.group;
        if (group && !known.group.has(group)) throw new ProjectError(400, "That group isn't in this project.");
        return { id: t.id, group, order: order(t.order) };
    });
    return { groups, tasks };
}

/**
 * New places for some of a project's tasks and groups, and which group each
 * of those tasks is in (PUT /projects/:projectId/arrange). Used for dragging,
 * "Put in group" and "Take out of group". Only what changed is written.
 * @returns {Promise<{projectId, tasks, groups}>} the project as it is now
 */
async function arrange(userName, projectId, body) {
    checkId(projectId, "project");
    await getProjectRow(userName, projectId);
    const state = await projectState(userName, projectId);
    const { groups, tasks } = cleanArrangement(body, state.tasks.map((t) => t.id), state.groups.map((g) => g.id));
    const oldTask = new Map(state.tasks.map((t) => [t.id, t]));
    const oldGroup = new Map(state.groups.map((g) => [g.id, g]));
    for (const g of groups) {
        if (oldGroup.get(g.id).order !== g.order) await setPlace(userName, groupKey(projectId, g.id), g.order);
    }
    for (const t of tasks) {
        const was = oldTask.get(t.id);
        if (was.order !== t.order || (was.group || null) !== t.group) await setPlace(userName, taskKey(projectId, t.id), t.order, t.group);
    }
    return projectState(userName, projectId);
}

// ---- Column layout ----------------------------------------------------------
// How the chart's table looks: each column's width, which columns are folded
// to a thin strip, and whether the whole table is folded to task names.
// Kept on the account (one map on the user's settings row,
// `dictionary_user_settings`.projects_layout), so it's the same on every
// computer. Example:
//   { widths: { name: 260, who: 120 }, folded: ["days"], tableFolded: false }
const SETTINGS_TABLE = "dictionary_user_settings";
const LAYOUT_COLUMNS = ["name", "start", "days", "who", "notes"];
const FOLDABLE = ["start", "days", "who", "notes"];   // the Task column can't fold
const MIN_WIDTH = { name: 100 };
const MIN_ANY = 40;
const MAX_WIDTH = 600;

/**
 * Checks a layout as sent by the web app; unknown columns and odd values are
 * dropped rather than refused (it's only how the table looks). Pure.
 */
function cleanLayout(input) {
    const body = input && typeof input === "object" ? input : {};
    const widths = {};
    const given = body.widths && typeof body.widths === "object" ? body.widths : {};
    LAYOUT_COLUMNS.forEach((key) => {
        const w = Math.round(Number(given[key]));
        if (Number.isFinite(w)) widths[key] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH[key] || MIN_ANY, w));
    });
    const folded = Array.isArray(body.folded) ? [...new Set(body.folded.filter((k) => FOLDABLE.includes(k)))] : [];
    return { widths, folded, tableFolded: body.tableFolded === true };
}

/** The saved layout, or the empty one (the app's own widths) if none. */
async function getLayout(userName) {
    const data = await db().get({
        TableName: SETTINGS_TABLE,
        Key: { user_name: userName },
        ProjectionExpression: "projects_layout",
    }).promise();
    return cleanLayout(data.Item && data.Item.projects_layout);
}

/** Save the layout (PUT /projects/layout); returns it as stored. */
async function setLayout(userName, body) {
    const layout = cleanLayout(body);
    await db().update({
        TableName: SETTINGS_TABLE,
        Key: { user_name: userName },
        UpdateExpression: "SET projects_layout = :l",
        ExpressionAttributeValues: { ":l": layout },
    }).promise();
    return layout;
}

// ---- Holidays -----------------------------------------------------------------
// Days skipped like weekends in every project (decided: one list for all the
// user's projects). Kept on the account, on the user's settings row:
//   dictionary_user_settings.projects_holidays = [{ date: "2026-12-25", name: "Christmas" }]
// The web app does the date math (utils/projectSchedule.js); the server only
// keeps the list sound.
const MAX_HOLIDAYS = 400;
const MAX_HOLIDAY_NAME = 80;

/** Checks a holiday list as sent by the web app: real dates, one entry per date, sorted. Pure. */
function cleanHolidays(input) {
    const list = Array.isArray(input) ? input : (input && Array.isArray(input.holidays) ? input.holidays : null);
    if (!list) throw new ProjectError(400, "Send the list of holidays.");
    if (list.length > MAX_HOLIDAYS) throw new ProjectError(413, `You can have up to ${MAX_HOLIDAYS} holidays.`);
    const byDate = new Map();
    list.forEach((h) => {
        const date = h && typeof h === "object" ? h.date : h;
        if (!isDate(date)) throw new ProjectError(400, "Each holiday needs a real date.");
        const name = h && typeof h.name === "string" ? h.name.trim().slice(0, MAX_HOLIDAY_NAME) : "";
        byDate.set(date, { date, name });
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The user's holidays ([] when none). */
async function getHolidays(userName) {
    const data = await db().get({
        TableName: SETTINGS_TABLE,
        Key: { user_name: userName },
        ProjectionExpression: "projects_holidays",
    }).promise();
    try { return cleanHolidays((data.Item && data.Item.projects_holidays) || []); } catch (err) { return []; }
}

/** Save the whole list (PUT /projects/holidays); returns it as stored. */
async function setHolidays(userName, body) {
    const holidays = cleanHolidays(body);
    await db().update({
        TableName: SETTINGS_TABLE,
        Key: { user_name: userName },
        UpdateExpression: "SET projects_holidays = :h",
        ExpressionAttributeValues: { ":h": holidays },
    }).promise();
    return holidays;
}

module.exports = {
    listAll,
    createProject,
    renameProject,
    deleteProject,
    createTask,
    updateTask,
    deleteTask,
    cleanTask,
    makesLoop,
    isDate,
    ProjectError,
    cleanLayout,
    cleanHolidays,
    getHolidays,
    setHolidays,
    createGroup,
    renameGroup,
    ungroup,
    arrange,
    cleanArrangement,
    getLayout,
    setLayout,
};
