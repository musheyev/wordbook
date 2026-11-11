/**
 * Classrooms: a teacher shares copies of notes, words, notebooks and
 * wordbooks with the students they invite. Students read and listen, and can
 * save copies to their own notebooks; they can't change what's in it.
 *
 * Who does what
 * -------------
 *   teacher   (a teacher account, teachers.js) creates, renames, closes,
 *             reopens and deletes classrooms; invites students by username;
 *             sends and removes items. In the web app, on a computer.
 *   student   is invited, joins (or declines), reads, saves copies, leaves.
 *             On any device.
 * Members see each other's usernames, never email addresses.
 *
 * Items are frozen copies, taken when the teacher sends them — the same
 * snapshot the Inbox takes when something is shared (inbox.snapshotItem), and
 * saved into a student's account the same way (inbox.copyIntoNotebook /
 * copyNotebookIntoAccount). Changing the original later doesn't change the
 * classroom's copy; the teacher can remove it and send it again.
 *
 * Closed: students no longer see anything in it (it shows as "Closed" in
 * their list); only the teacher can open it, and reopen it. Deleted: gone;
 * copies students saved stay theirs. Revoking a teacher closes their
 * classrooms (closeAllFor); deleting a teacher's account deletes them, and a
 * student's account loses its memberships (deleteForUser).
 *
 * Table: dictionary_classrooms (created by create-classrooms-table.js)
 * ----------------------------
 * One partition per classroom (classroom_id), with rows told apart by sk:
 *   "meta"                   the classroom: title, status ("open" | "closed"),
 *                            created_at, updated_at; user_name = the teacher
 *   "member#<username>"      a student: status ("invited" | "joined"),
 *                            invited_at, joined_at; user_name = the student
 *   "item#<ISO time>#<id>"   something the teacher sent: the stored copy
 *                            (item_type "card" | "word" | "notebook", title,
 *                            content / word / notebook…), added_at
 * Index "by-user" (user_name, classroom_id): every classroom a user teaches
 * (meta rows) or belongs to (member rows) — "My Classrooms". Item rows have
 * no user_name, so they stay out of it.
 */
const crypto = require("crypto");
const database = require("./dynamoDb");
const inbox = require("./inbox");
const teachers = require("./teachers");
const { findUsername } = require("./cognitoUsers");

const TABLE = "dictionary_classrooms";
const BY_USER = "by-user";
const META = "meta";
const MEMBER = "member#";
const ITEM = "item#";

const MAX_CLASSROOMS = 30;   // per teacher
const MAX_STUDENTS = 100;    // per classroom, invited or joined
const MAX_ITEMS = 300;       // per classroom
const MAX_TITLE = 80;

const db = () => database.dynamoDbClientInstance();

/** A problem to tell the user, with the HTTP status to answer. */
class ClassroomError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** Run `fn`, turning the Inbox's errors (from snapshots and copies) into ours. */
async function withInboxErrors(fn) {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof inbox.InboxError) throw new ClassroomError(err.status, err.message);
        throw err;
    }
}

function title(value) {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s) throw new ClassroomError(400, "Give the classroom a name.");
    if (s.length > MAX_TITLE) throw new ClassroomError(400, `Keep the name under ${MAX_TITLE} characters.`);
    return s;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function getMeta(classroomId) {
    if (typeof classroomId !== "string" || !classroomId) return null;
    const data = await db().get({ TableName: TABLE, Key: { classroom_id: classroomId, sk: META } }).promise();
    return data.Item || null;
}

async function getMember(classroomId, userName) {
    const data = await db().get({ TableName: TABLE, Key: { classroom_id: classroomId, sk: MEMBER + userName } }).promise();
    return data.Item || null;
}

/** Every row of a classroom whose sk starts with `prefix`, all pages. */
async function rowsOf(classroomId, prefix) {
    const rows = [];
    let start;
    do {
        const page = await db().query({
            TableName: TABLE,
            KeyConditionExpression: "classroom_id = :id AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":id": classroomId, ":p": prefix },
            ExclusiveStartKey: start,
        }).promise();
        rows.push(...page.Items);
        start = page.LastEvaluatedKey;
    } while (start);
    return rows;
}

/** The user's rows in the by-user index: classrooms they teach or belong to. */
async function rowsForUser(userName) {
    const rows = [];
    let start;
    do {
        const page = await db().query({
            TableName: TABLE,
            IndexName: BY_USER,
            KeyConditionExpression: "user_name = :u",
            ExpressionAttributeValues: { ":u": userName },
            ExclusiveStartKey: start,
        }).promise();
        rows.push(...page.Items);
        start = page.LastEvaluatedKey;
    } while (start);
    return rows;
}

/** The name students see for a teacher (their teacher-account name). */
async function teacherName(userName) {
    try {
        const me = await teachers.getMine(userName);
        return me.displayName || userName;
    } catch (err) {
        return userName;
    }
}

const metaView = async (meta) => ({
    id: meta.classroom_id,
    title: meta.title,
    status: meta.status,
    teacher: meta.user_name,
    teacherName: await teacherName(meta.user_name),
    createdAt: meta.created_at,
});

/** An item as lists show it (no content). */
function itemSummary(row) {
    return {
        id: row.sk.slice(ITEM.length),
        type: row.item_type,
        title: row.item_type === "word" ? row.word : row.title,
        preview: row.preview || "",
        kind: row.kind || null,
        wordCount: row.word_count || 0,
        noteCount: row.note_count || 0,
        addedAt: row.added_at,
    };
}

/**
 * My Classrooms: the ones you teach, the ones you're in, and invitations,
 * and whether you're a teacher (so the app can show My Classrooms before a
 * new teacher's first classroom exists).
 *
 * @param {string} userName
 * @returns {Promise<{teaching: object[], joined: object[], invited: object[], isTeacher: boolean}>}
 */
async function listMine(userName) {
    const rows = await rowsForUser(userName);
    const teaching = [];
    const memberRows = [];
    for (const row of rows) {
        if (row.sk === META) teaching.push(await metaView(row));
        else if (row.sk.startsWith(MEMBER)) memberRows.push(row);
    }
    const joined = [];
    const invited = [];
    for (const row of memberRows) {
        const meta = await getMeta(row.classroom_id);
        if (!meta) continue;
        const view = { ...(await metaView(meta)), memberStatus: row.status, invitedAt: row.invited_at };
        (row.status === "joined" ? joined : invited).push(view);
    }
    const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
    return {
        teaching: teaching.sort(byTitle), joined: joined.sort(byTitle), invited,
        isTeacher: await teachers.isTeacher(userName),
    };
}

/**
 * What `userName` may do with a classroom: "teacher", "student" (joined, and
 * the classroom is open), or a ClassroomError. Invited-but-not-joined users
 * and anyone else get 403/404, so nothing in it leaks.
 */
async function access(classroomId, userName) {
    const meta = await getMeta(classroomId);
    if (!meta) throw new ClassroomError(404, "That classroom doesn't exist.");
    if (meta.user_name === userName) return { meta, role: "teacher" };
    const member = await getMember(classroomId, userName);
    if (!member || member.status !== "joined") throw new ClassroomError(404, "That classroom doesn't exist.");
    if (meta.status !== "open") throw new ClassroomError(403, "Your teacher closed this classroom.");
    return { meta, role: "student" };
}

/** Only the classroom's teacher. */
async function asTeacher(classroomId, userName) {
    const meta = await getMeta(classroomId);
    if (!meta || meta.user_name !== userName) throw new ClassroomError(404, "That classroom doesn't exist.");
    return meta;
}

/**
 * One classroom: its details, items (newest first) and members. The teacher
 * sees every member with their status; students see who has joined.
 */
async function read(classroomId, userName) {
    const { meta, role } = await access(classroomId, userName);
    const [items, members] = await Promise.all([rowsOf(classroomId, ITEM), rowsOf(classroomId, MEMBER)]);
    return {
        ...(await metaView(meta)),
        role,
        items: items.map(itemSummary).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))),
        members: members
            .filter((m) => role === "teacher" || m.status === "joined")
            .map((m) => ({ userName: m.user_name, status: m.status, joinedAt: m.joined_at || null }))
            .sort((a, b) => a.userName.localeCompare(b.userName)),
    };
}

async function itemRow(classroomId, itemId) {
    if (typeof itemId !== "string" || !itemId) throw new ClassroomError(404, "That item isn't in this classroom.");
    const data = await db().get({ TableName: TABLE, Key: { classroom_id: classroomId, sk: ITEM + itemId } }).promise();
    if (!data.Item) throw new ClassroomError(404, "That item isn't in this classroom.");
    return data.Item;
}

/** One item, with its content: a note's text, a word, or a notebook's words and notes. */
async function readItem(classroomId, userName, itemId) {
    await access(classroomId, userName);
    const row = await itemRow(classroomId, itemId);
    const out = itemSummary(row);
    if (row.item_type === "card") out.content = row.content;
    if (row.item_type === "notebook") {
        const nb = row.notebook || { words: [], cards: [] };
        out.words = nb.words || [];
        out.notes = (nb.cards || []).map((c, i) => ({ index: i, title: c.title, content: c.content }));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

/** Create a classroom (teachers only). */
async function create(userName, name) {
    if (!await teachers.isTeacher(userName)) throw new ClassroomError(403, "Only teachers can create classrooms.");
    const t = title(name);
    const mine = (await rowsForUser(userName)).filter((r) => r.sk === META);
    if (mine.length >= MAX_CLASSROOMS) throw new ClassroomError(409, `You can have up to ${MAX_CLASSROOMS} classrooms.`);
    const now = new Date().toISOString();
    const meta = {
        classroom_id: crypto.randomUUID(), sk: META, user_name: userName,
        title: t, status: "open", created_at: now, updated_at: now,
    };
    await db().put({ TableName: TABLE, Item: meta }).promise();
    return metaView(meta);
}

/** Rename, close ("closed") or reopen ("open"). */
async function update(classroomId, userName, changes = {}) {
    const meta = await asTeacher(classroomId, userName);
    const next = { ...meta, updated_at: new Date().toISOString() };
    if (changes.title !== undefined) next.title = title(changes.title);
    if (changes.status !== undefined) {
        if (!["open", "closed"].includes(changes.status)) throw new ClassroomError(400, "Unknown status.");
        // A revoked teacher can't reopen: closed is how revoking leaves them.
        if (changes.status === "open" && !await teachers.isTeacher(userName)) {
            throw new ClassroomError(403, "Your teacher account is off, so this classroom stays closed.");
        }
        next.status = changes.status;
    }
    await db().put({ TableName: TABLE, Item: next }).promise();
    return metaView(next);
}

/** Delete every row of a classroom, 25 at a time. */
async function deleteAllRows(classroomId) {
    const rows = await rowsOf(classroomId, "");
    for (let i = 0; i < rows.length; i += 25) {
        let requests = rows.slice(i, i + 25).map((r) => ({ DeleteRequest: { Key: { classroom_id: r.classroom_id, sk: r.sk } } }));
        while (requests.length) {
            const out = await db().batchWrite({ RequestItems: { [TABLE]: requests } }).promise();
            requests = (out.UnprocessedItems && out.UnprocessedItems[TABLE]) || [];
        }
    }
}

/** Delete a classroom. Copies students saved stay theirs. */
async function remove(classroomId, userName) {
    await asTeacher(classroomId, userName);
    await deleteAllRows(classroomId);
}

/**
 * Invite a student by username. They see the invitation in My Classrooms and
 * join or decline. The teacher learns whether the username exists: they need
 * to know whom they invited, and only teachers can invite.
 */
async function invite(classroomId, userName, typed) {
    await asTeacher(classroomId, userName);
    const raw = typeof typed === "string" ? typed.trim() : "";
    if (!raw) throw new ClassroomError(400, "Type the student's username.");
    const student = await findUsername(raw);
    if (!student) throw new ClassroomError(404, `There's no account named "${raw}".`);
    if (student === userName) throw new ClassroomError(400, "You can't invite yourself.");
    if (await getMember(classroomId, student)) throw new ClassroomError(409, `${student} is already invited.`);
    const members = await rowsOf(classroomId, MEMBER);
    if (members.length >= MAX_STUDENTS) throw new ClassroomError(409, `A classroom can have up to ${MAX_STUDENTS} students.`);
    const row = {
        classroom_id: classroomId, sk: MEMBER + student, user_name: student,
        status: "invited", invited_at: new Date().toISOString(), invited_by: userName,
    };
    await db().put({ TableName: TABLE, Item: row }).promise();
    return { userName: student, status: "invited", joinedAt: null };
}

/** Take a student (or their invitation) out of the classroom. */
async function removeMember(classroomId, userName, student) {
    await asTeacher(classroomId, userName);
    await db().delete({ TableName: TABLE, Key: { classroom_id: classroomId, sk: MEMBER + String(student || "") } }).promise();
}

/**
 * Send a copy of one of the teacher's own notes, words or notebooks (a
 * notebook or wordbook goes whole). item: { type: "card" | "word" | "notebook", id }.
 */
async function addItem(classroomId, userName, item) {
    await asTeacher(classroomId, userName);
    const items = await rowsOf(classroomId, ITEM);
    if (items.length >= MAX_ITEMS) throw new ClassroomError(409, `A classroom can hold up to ${MAX_ITEMS} items.`);
    const snapshot = await withInboxErrors(() => inbox.snapshotItem(userName, item));
    const now = new Date().toISOString();
    const row = { classroom_id: classroomId, sk: `${ITEM}${now}#${crypto.randomUUID()}`, ...snapshot, added_at: now };
    await db().put({ TableName: TABLE, Item: row }).promise();
    return itemSummary(row);
}

/** Take an item out. Copies students already saved stay theirs. */
async function removeItem(classroomId, userName, itemId) {
    await asTeacher(classroomId, userName);
    await db().delete({ TableName: TABLE, Key: { classroom_id: classroomId, sk: ITEM + String(itemId || "") } }).promise();
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

/** Join, or decline (which deletes the invitation). */
async function respond(classroomId, userName, answer) {
    const member = await getMember(classroomId, userName);
    if (!member) throw new ClassroomError(404, "That invitation isn't there any more.");
    if (answer === "decline") {
        await db().delete({ TableName: TABLE, Key: { classroom_id: classroomId, sk: MEMBER + userName } }).promise();
        return { status: "declined" };
    }
    if (answer !== "join") throw new ClassroomError(400, "Join or decline.");
    if (member.status !== "joined") {
        await db().put({ TableName: TABLE, Item: { ...member, status: "joined", joined_at: new Date().toISOString() } }).promise();
    }
    return { status: "joined" };
}

/** Leave a classroom. Copies you saved stay yours. */
async function leave(classroomId, userName) {
    await db().delete({ TableName: TABLE, Key: { classroom_id: classroomId, sk: MEMBER + userName } }).promise();
}

/**
 * Save a copy of an item into your own account.
 *   note / word          into one of your notebooks: { wordbook }
 *   notebook / wordbook  as a new one of yours: { name } (a wordbook stays one)
 *   one note of a notebook item: { note: index, wordbook }
 *
 * @returns {Promise<object>} { type: "card"|"word", id } or { type: "notebook", name }
 */
async function saveItem(classroomId, userName, itemId, target = {}) {
    const { meta } = await access(classroomId, userName);
    const row = await itemRow(classroomId, itemId);
    const origin = { shared_by: meta.user_name, shared_at: row.added_at, from_classroom: meta.title };
    return withInboxErrors(async () => {
        if (row.item_type === "notebook" && target.note === undefined) {
            const name = await inbox.copyNotebookIntoAccount(userName, row, String(target.name || row.title), origin);
            return { type: "notebook", name };
        }
        const wordbookName = String(target.wordbook || "");
        if (!wordbookName) throw new ClassroomError(400, "Choose a notebook to save it in.");
        let source = row;
        if (row.item_type === "notebook") {
            const note = ((row.notebook && row.notebook.cards) || [])[Number(target.note)];
            if (!note) throw new ClassroomError(404, "That note isn't in this notebook.");
            source = { item_type: "card", title: note.title, content: note.content };
        }
        return inbox.copyIntoNotebook(userName, source, wordbookName, origin);
    });
}

// ---------------------------------------------------------------------------
// Account and teacher-status hooks
// ---------------------------------------------------------------------------

/** Revoking a teacher closes every classroom they teach. */
async function closeAllFor(teacher) {
    const metas = (await rowsForUser(teacher)).filter((r) => r.sk === META && r.status !== "closed");
    for (const meta of metas) {
        await db().put({ TableName: TABLE, Item: { ...meta, status: "closed", updated_at: new Date().toISOString() } }).promise();
    }
    return metas.length;
}

/** Deleting an account: their classrooms go, and their memberships. */
async function deleteForUser(userName) {
    for (const row of await rowsForUser(userName)) {
        if (row.sk === META) await deleteAllRows(row.classroom_id);
        else await db().delete({ TableName: TABLE, Key: { classroom_id: row.classroom_id, sk: row.sk } }).promise();
    }
}

module.exports = {
    TABLE, BY_USER, ClassroomError, MAX_CLASSROOMS, MAX_STUDENTS, MAX_ITEMS,
    listMine, read, readItem, create, update, remove, invite, removeMember, addItem, removeItem,
    respond, leave, saveItem, closeAllFor, deleteForUser,
};

