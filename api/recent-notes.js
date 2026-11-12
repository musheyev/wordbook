// Recent notes: the notes and words you opened most recently, newest first,
// so you can go back to them (the clock button above an open note, web
// RecentNotesButton.js). Kept on the account, so the website and the iPhone
// app share one list, as a map on the user's settings row
// (`dictionary_user_settings`, see user-settings.js), like bookmarks.js:
//
//   recent_notes   { "card#<id>": { at, wordbook, title }, "word#hola": { … }, … }
//
// Why a map and not a list: opening a note is one SET on its own entry
// (newer `at`, same key), so two devices opening notes at once can't
// overwrite each other's, and opening the same note again just moves it to
// the front instead of adding a duplicate. The order comes from `at`.
//
//   wordbook  the notebook it was opened in, to open it there again
//   title     how it was called then; a note's current title is shown when
//             it can be read (it may have been renamed since)
//
// The map is trimmed when it's read: only the newest KEEP are kept, so it
// can't grow without end (the list shows SHOW of them).
const database = require("./dynamoDb");
const { noteTitles } = require("./note-links");

const TABLE = "dictionary_user_settings";
const ATTR = "recent_notes";
const SHOW = 12;
const KEEP = 30;
const MAX_ID = 300;
const MAX_NAME = 200;
const MAX_TITLE = 200;

/** A refusal with a status code and a message for the user. */
class RecentError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const keyOf = (type, id) => `${type}#${id}`;

/** True when DynamoDB refused because the map isn't there yet. */
const isMissingMap = (err) => err.code === "ValidationException" || err.name === "ValidationException";

/**
 * Remember that a note or word was just opened (PUT /recent-notes/:type/:id).
 *
 * @param {string} userName
 * @param {'card'|'word'} type
 * @param {string} id
 * @param {string} wordbook the notebook it was opened in
 * @param {string} [title] its title now
 * @returns {Promise<{type, id, wordbook, title, at}>}
 */
async function noteOpened(userName, type, id, wordbook, title) {
    if (!["card", "word"].includes(type) || typeof id !== "string" || !id.trim() || id.length > MAX_ID) {
        throw new RecentError(400, "Choose a note or a word.");
    }
    if (typeof wordbook !== "string" || !wordbook.trim() || wordbook.length > MAX_NAME) {
        throw new RecentError(400, "Which notebook was it opened in?");
    }
    const entry = {
        at: new Date().toISOString(),
        wordbook,
        title: String(title || id).slice(0, MAX_TITLE),
    };
    const client = database.dynamoDbClientInstance();
    const params = {
        TableName: TABLE,
        Key: { user_name: userName },
        UpdateExpression: "SET #m.#k = :entry",
        ExpressionAttributeNames: { "#m": ATTR, "#k": keyOf(type, id) },
        ExpressionAttributeValues: { ":entry": entry },
    };
    try {
        await client.update(params).promise();
    } catch (err) {
        if (!isMissingMap(err)) throw err;
        // The first one: make the map, then add to it.
        await client.update({
            TableName: TABLE,
            Key: { user_name: userName },
            UpdateExpression: `SET ${ATTR} = if_not_exists(${ATTR}, :empty)`,
            ExpressionAttributeValues: { ":empty": {} },
        }).promise();
        await client.update(params).promise();
    }
    return { type, id, ...entry };
}

/** Remove entries by map key (missing ones, or no map at all, are fine). */
async function removeKeys(userName, keys) {
    const client = database.dynamoDbClientInstance();
    for (let start = 0; start < keys.length; start += 100) {
        const batch = keys.slice(start, start + 100);
        const names = { "#m": ATTR };
        batch.forEach((key, i) => { names[`#k${i}`] = key; });
        try {
            await client.update({
                TableName: TABLE,
                Key: { user_name: userName },
                UpdateExpression: `REMOVE ${batch.map((_, i) => `#m.#k${i}`).join(", ")}`,
                ExpressionAttributeNames: names,
            }).promise();
        } catch (err) {
            if (!isMissingMap(err)) throw err;
        }
    }
}

/**
 * The most recently opened notes and words, newest first (GET /recent-notes).
 * Notes deleted since are left out (and forgotten), and notes show their
 * current titles. Also trims the stored map to the newest KEEP.
 *
 * @param {string} userName
 * @returns {Promise<Array<{type: 'card'|'word', id: string, wordbook: string, title: string, at: string}>>}
 */
async function listRecent(userName) {
    const data = await database.dynamoDbClientInstance().get({
        TableName: TABLE,
        Key: { user_name: userName },
        ProjectionExpression: ATTR,
    }).promise();
    const map = (data.Item && data.Item[ATTR]) || {};
    const all = Object.entries(map).map(([key, value]) => {
        const hash = key.indexOf("#");
        return {
            type: key.slice(0, hash),
            id: key.slice(hash + 1),
            wordbook: (value && value.wordbook) || "",
            title: (value && value.title) || "",
            at: (value && value.at) || "",
        };
    })
        .filter((r) => (r.type === "card" || r.type === "word") && r.wordbook)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));

    // Forget the oldest beyond KEEP (never fails the list).
    const old = all.slice(KEEP).map((r) => keyOf(r.type, r.id));

    const shown = all.slice(0, KEEP);
    const cardIds = shown.filter((r) => r.type === "card").map((r) => r.id);
    const titles = cardIds.length ? await noteTitles(userName, cardIds) : {};
    // Deleted notes: forget them too.
    const gone = shown.filter((r) => r.type === "card" && !(r.id in titles)).map((r) => keyOf(r.type, r.id));
    if (old.length || gone.length) {
        await removeKeys(userName, [...old, ...gone])
            .catch((err) => console.log(`recent notes cleanup error: ${err.name || err}`));
    }

    return shown
        .filter((r) => r.type === "word" || r.id in titles)
        .map((r) => (r.type === "card" ? { ...r, title: titles[r.id] || r.title } : { ...r, title: r.id }))
        .slice(0, SHOW);
}

module.exports = { noteOpened, listRecent, RecentError, SHOW, KEEP };
