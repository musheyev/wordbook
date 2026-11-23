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
//                                              notes, order, … }
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
// The server's own job is to keep the data sound: names and numbers in
// range, "waits for" only on tasks of the same project, and no loops (A waits
// for B, B waits for A: neither could ever start).
const crypto = require("crypto");
const database = require("./dynamoDb");
const { noteTitles } = require("./note-links");

const TABLE = "dictionary_projects";

const MAX_PROJECTS = 200;
const MAX_TASKS = 500;          // per project
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
const newId = () => crypto.randomUUID();

/** Ids we made (UUIDs); anything else in a URL is refused before it reaches a key. */
const isId = (id) => typeof id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(id);

function checkId(id, what) {
    if (!isId(id)) throw new ProjectError(400, `That ${what} wasn't found.`);
    return id;
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
});

const projectOut = (row) => ({ id: row.project_id, name: row.name, created_at: row.created_at });

async function getProjectRow(userName, projectId) {
    const data = await db().get({ TableName: TABLE, Key: { user_name: userName, item_key: projectKey(projectId) } }).promise();
    if (!data.Item) throw new ProjectError(404, "That project wasn't found.");
    return data.Item;
}

/** One project's tasks as stored rows. */
const projectTaskRows = (userName, projectId) => readRows(userName, `task#${projectId}#`);

/**
 * All the user's projects and tasks (GET /projects). Projects oldest first;
 * tasks in their order. Each linked note comes with its title now; notes
 * deleted since are left out (the link quietly goes away).
 *
 * @param {string} userName
 * @returns {Promise<{projects: object[], tasks: object[]}>}
 */
async function listAll(userName) {
    const rows = await readRows(userName);
    const projects = rows.filter((r) => r.item_key.startsWith("project#")).map(projectOut)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const tasks = rows.filter((r) => r.item_key.startsWith("task#")).map(taskOut)
        .sort((a, b) => a.order - b.order);

    const cardIds = [...new Set(tasks.flatMap((t) => t.notes.filter((n) => n.type === "card").map((n) => n.id)))];
    const titles = cardIds.length ? await noteTitles(userName, cardIds) : {};
    tasks.forEach((t) => {
        t.notes = t.notes
            .filter((n) => n.type === "word" || n.id in titles)
            .map((n) => ({ ...n, title: n.type === "card" ? titles[n.id] : n.id }));
    });
    return { projects, tasks };
}

/** Make a project (POST /projects). */
async function createProject(userName, body) {
    const name = cleanName(body && body.name, "project");
    const rows = await readRows(userName, "project#");
    if (rows.length >= MAX_PROJECTS) throw new ProjectError(413, `You can have up to ${MAX_PROJECTS} projects.`);
    const now = new Date().toISOString();
    const projectId = newId();
    const row = { user_name: userName, item_key: projectKey(projectId), project_id: projectId, name, created_at: now, updated_at: now };
    await db().put({ TableName: TABLE, Item: row }).promise();
    return projectOut(row);
}

/** Rename a project (PUT /projects/:projectId). */
async function renameProject(userName, projectId, body) {
    checkId(projectId, "project");
    const name = cleanName(body && body.name, "project");
    const row = await getProjectRow(userName, projectId);
    await db().update({
        TableName: TABLE,
        Key: { user_name: userName, item_key: projectKey(projectId) },
        UpdateExpression: "SET #n = :n, updated_at = :t",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":n": name, ":t": new Date().toISOString() },
    }).promise();
    return projectOut({ ...row, name });
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
    // Tasks first, the project last: if this stops halfway, the project is
    // still there to delete again.
    await deleteKeys(userName, taskRows.map((r) => r.item_key));
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
    await db().put({ TableName: TABLE, Item: row }).promise();
    return row;
}

/** Add a task to a project (POST /projects/:projectId/tasks). */
async function createTask(userName, projectId, body) {
    checkId(projectId, "project");
    const fields = cleanTask(body);
    await getProjectRow(userName, projectId);
    const tasks = (await projectTaskRows(userName, projectId)).map(taskOut);
    if (tasks.length >= MAX_TASKS) throw new ProjectError(413, `A project can have up to ${MAX_TASKS} tasks.`);
    const taskId = newId();
    checkAfter(tasks, taskId, fields.after);
    if (body.order == null) fields.order = tasks.reduce((max, t) => Math.max(max, t.order), 0) + 1;
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
    checkAfter(rows.map(taskOut), taskId, fields.after);
    return taskOut(await putTask(userName, projectId, taskId, fields, old.created_at));
}

/**
 * Delete a task (DELETE /projects/:projectId/tasks/:taskId). Tasks that
 * waited for it stop waiting for it. One that then waits for nothing keeps
 * the start it had: the web app works those dates out and sends them as
 * `starts` ({ taskId: "YYYY-MM-DD" }). Without one, it starts where the
 * deleted task started.
 *
 * @returns {Promise<{changed: object[]}>} the tasks that changed because of it
 */
async function deleteTask(userName, projectId, taskId, starts) {
    checkId(projectId, "project");
    checkId(taskId, "task");
    const given = starts && typeof starts === "object" ? starts : {};
    const rows = await projectTaskRows(userName, projectId);
    const gone = rows.find((r) => r.task_id === taskId);
    if (!gone) throw new ProjectError(404, "That task wasn't found.");

    const changed = [];
    for (const row of rows) {
        if (row.task_id === taskId || !(row.after || []).includes(taskId)) continue;
        const fields = { ...taskOut(row) };
        fields.after = fields.after.filter((id) => id !== taskId);
        if (!fields.after.length) {
            const start = given[row.task_id];
            fields.start = isDate(start) ? start : (gone.start || new Date().toISOString().slice(0, 10));
        }
        const { name, days, after, start, who, notes, order } = fields;
        changed.push(taskOut(await putTask(userName, projectId, row.task_id, { name, days, after, start, who, notes, order }, row.created_at)));
    }
    await deleteKeys(userName, [gone.item_key]);
    return { changed };
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
};
