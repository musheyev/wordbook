/**
 * Teacher accounts: who is a teacher, and asking to become one.
 *
 * A teacher can (later) run classrooms. Becoming one is a request: the user
 * fills in a short form ("Become a teacher", web /teacher), and an admin
 * approves or declines it (admin Teachers page). Until payments exist, that
 * approval is the gate; later a trial and payment take its place and the
 * rest stays the same (see the teacher accounts plan, T1–T5).
 *
 * Table: dictionary_teachers (created by create-teachers-table.js)
 * --------------------------
 *   user_name   (partition key)  one row per teacher or applicant
 *   status      "requested" | "active" | "declined" | "revoked"
 *   display_name                 the name students will see ("Ms. Rivera")
 *   subject, level               what they'll teach, and to whom
 *   students    "1-10" | "10-30" | "30+"   roughly how many students
 *   country
 *   rules_agreed_at              when they agreed to the teacher rules
 *   requested_at
 *   decided_at, decided_by       when and by which admin it was approved,
 *                                declined, revoked or granted
 *   decline_reason               optional, shown to the user
 *   free        true             made a teacher by an admin without asking
 *
 * Its own table, not a setting in dictionary_user_settings: admins list
 * everyone by status, and payments will change the status on their own.
 * Not a Cognito group either (like "admins"), for the same reason.
 */
const database = require("./dynamoDb");

const TABLE = "dictionary_teachers";

const STATUSES = ["requested", "active", "declined", "revoked"];
const STUDENT_COUNTS = ["1-10", "10-30", "30+"];
/** After a decline, how long before the user may ask again. */
const RETRY_DAYS = 30;

const db = () => database.dynamoDbClientInstance();

/** A problem the user (or admin) can fix, with the HTTP status to answer. */
class TeacherError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** The public view of a row: what /teacher/me and the admin page show. */
function view(row) {
    if (!row) return { status: "none" };
    const out = {
        status: row.status,
        displayName: row.display_name || "",
        subject: row.subject || "",
        level: row.level || "",
        students: row.students || "",
        country: row.country || "",
        requestedAt: row.requested_at || null,
        decidedAt: row.decided_at || null,
        free: !!row.free,
    };
    if (row.status === "declined") {
        out.declineReason = row.decline_reason || "";
        out.canAskAgainAt = retryDate(row);
    }
    return out;
}

/** When someone declined may ask again (ISO time). */
function retryDate(row) {
    const from = Date.parse(row.decided_at || row.requested_at || 0) || 0;
    return new Date(from + RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function getRow(userName) {
    const data = await db().get({ TableName: TABLE, Key: { user_name: userName } }).promise();
    return data.Item || null;
}

/**
 * The user's teacher status, for their own pages.
 *
 * @param {string} userName
 * @returns {Promise<object>} { status: "none" } or view(row)
 */
async function getMine(userName) {
    return view(await getRow(userName));
}

/** True if the user is a teacher now. The one check classroom features use. */
async function isTeacher(userName) {
    const row = await getRow(userName);
    return !!row && row.status === "active";
}

/** Trimmed text, or a TeacherError naming the field if it's missing or too long. */
function text(value, label, max, required = true) {
    const s = typeof value === "string" ? value.trim() : "";
    if (required && !s) throw new TeacherError(400, `Fill in ${label}.`);
    if (s.length > max) throw new TeacherError(400, `${label[0].toUpperCase()}${label.slice(1)} is too long (${max} characters at most).`);
    return s;
}

/**
 * Ask to become a teacher. One open request at a time; a teacher can't ask
 * again; after a decline, wait RETRY_DAYS; after a revoke, only an admin can
 * make them a teacher again.
 *
 * @param {string} userName
 * @param {object} form { displayName, subject, level, students, country, agreeRules }
 * @returns {Promise<object>} the new view
 */
async function request(userName, form = {}) {
    const fields = {
        display_name: text(form.displayName, "the name students will see", 60),
        subject: text(form.subject, "what you'll teach", 100),
        level: text(form.level, "the level", 100),
        country: text(form.country, "your country", 60),
    };
    if (!STUDENT_COUNTS.includes(form.students)) {
        throw new TeacherError(400, "Choose about how many students you'll teach.");
    }
    if (form.agreeRules !== true) {
        throw new TeacherError(400, "Agree to the teacher rules to send your request.");
    }

    const existing = await getRow(userName);
    if (existing) {
        if (existing.status === "active") throw new TeacherError(409, "You're already a teacher.");
        if (existing.status === "requested") throw new TeacherError(409, "Your request is already waiting for review.");
        if (existing.status === "revoked") {
            throw new TeacherError(403, "Your teacher account was turned off. Contact support to talk about it.");
        }
        if (existing.status === "declined" && Date.now() < Date.parse(retryDate(existing))) {
            throw new TeacherError(429, "You can ask again after " + retryDate(existing).slice(0, 10) + ".");
        }
    }

    const now = new Date().toISOString();
    const row = {
        user_name: userName,
        status: "requested",
        ...fields,
        students: form.students,
        rules_agreed_at: now,
        requested_at: now,
    };
    await db().put({ TableName: TABLE, Item: row }).promise();
    return view(row);
}

/**
 * Every row with a status (admin Teachers page). The table holds one row per
 * teacher or applicant, so a scan stays small; it reads all pages.
 *
 * @param {string} status one of STATUSES
 * @returns {Promise<object[]>} { userName, ...view }, oldest request first
 */
async function listByStatus(status) {
    if (!STATUSES.includes(status)) throw new TeacherError(400, "Unknown status.");
    const rows = [];
    let start;
    do {
        const page = await db().scan({
            TableName: TABLE,
            FilterExpression: "#s = :s",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": status },
            ExclusiveStartKey: start,
        }).promise();
        rows.push(...page.Items);
        start = page.LastEvaluatedKey;
    } while (start);
    return rows
        .sort((a, b) => String(a.requested_at || a.decided_at || "").localeCompare(String(b.requested_at || b.decided_at || "")))
        .map((row) => ({ userName: row.user_name, ...view(row) }));
}

/** How many requests wait for review (the number on the admin's Teachers link). */
async function countRequests() {
    return (await listByStatus("requested")).length;
}

/**
 * An admin decision on a user's row: from one of `from` to `to`. Fails if
 * the row isn't in one of those states (someone else decided first).
 */
async function decide(userName, admin, from, to, extra = {}) {
    const now = new Date().toISOString();
    try {
        const out = await db().update({
            TableName: TABLE,
            Key: { user_name: userName },
            ConditionExpression: "#s IN (" + from.map((_, i) => `:f${i}`).join(", ") + ")",
            UpdateExpression: "SET #s = :to, decided_at = :now, decided_by = :admin"
                + Object.keys(extra).map((k) => `, ${k} = :${k}`).join(""),
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
                ":to": to, ":now": now, ":admin": admin,
                ...Object.fromEntries(from.map((f, i) => [`:f${i}`, f])),
                ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`:${k}`, v])),
            },
            ReturnValues: "ALL_NEW",
        }).promise();
        return { userName, ...view(out.Attributes) };
    } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
            throw new TeacherError(409, "That changed in the meantime. Refresh the list.");
        }
        throw err;
    }
}

/** Approve a request: the user becomes a teacher. */
const approve = (userName, admin) => decide(userName, admin, ["requested"], "active");

/** Decline a request, with an optional reason the user will see. */
const decline = (userName, admin, reason) =>
    decide(userName, admin, ["requested"], "declined", { decline_reason: text(reason, "the reason", 300, false) });

/** Turn a teacher off. (Later this also closes their classrooms.) */
const revoke = (userName, admin) => decide(userName, admin, ["active"], "revoked");

/**
 * Make someone a teacher without a request (free: for the owner, friends).
 * `userName` must already be the account's real username (cognitoUsers
 * findUsername). Keeps their earlier form answers, if any.
 */
async function grant(userName, admin, displayName) {
    const existing = await getRow(userName);
    if (existing && existing.status === "active") throw new TeacherError(409, `${userName} is already a teacher.`);
    const now = new Date().toISOString();
    const row = {
        ...(existing || {}),
        user_name: userName,
        status: "active",
        display_name: text(displayName, "the name students will see", 60, false) || (existing && existing.display_name) || userName,
        decided_at: now,
        decided_by: admin,
        free: true,
    };
    delete row.decline_reason;
    await db().put({ TableName: TABLE, Item: row }).promise();
    return { userName, ...view(row) };
}

module.exports = {
    TABLE, STATUSES, STUDENT_COUNTS, RETRY_DAYS, TeacherError,
    getMine, isTeacher, request, listByStatus, countRequests, approve, decline, revoke, grant,
};
