// Bookmarks ("My Bookmarks"): notes and words the user starred to find again.
// Kept on the account, so they're the same on every device, as a map on the
// user's settings row (`dictionary_user_settings`, see user-settings.js):
//
//   bookmarks   { "card#<id>": { at, title }, "word#hola": { at, title }, … }
//
// A map rather than a list, so adding or removing one bookmark changes just
// that entry (SET / REMOVE on its path): two devices bookmarking at once
// can't overwrite each other. `at` (when it was bookmarked) gives the order,
// newest first; `title` is how it looked then, used only if it can't be
// read now.
//
// The list shows notes' titles as they are now, and leaves out notes that
// were deleted since (they're dropped from the map at the same time).
const database = require("./dynamoDb");
const { noteTitles } = require("./note-links");

const TABLE = "dictionary_user_settings";
const MAX_BOOKMARKS = 1000;
const MAX_ID = 300;
const MAX_TITLE = 200;

/** A refusal with a status code and a message for the user. */
class BookmarkError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const keyOf = (type, id) => `${type}#${id}`;

/** Checks a bookmark's item; returns its map key. */
function checkedKey(type, id) {
    if (!["card", "word"].includes(type) || typeof id !== "string" || !id.trim() || id.length > MAX_ID) {
        throw new BookmarkError(400, "Choose a note or a word.");
    }
    return keyOf(type, type === "word" ? id.trim() : id);
}

/** The bookmarks map as stored ({} when there are none). */
async function readMap(userName) {
    const data = await database.dynamoDbClientInstance().get({
        TableName: TABLE,
        Key: { user_name: userName },
        ProjectionExpression: "bookmarks",
    }).promise();
    return (data.Item && data.Item.bookmarks) || {};
}

/**
 * The user's bookmarks, newest first (GET /bookmarks).
 *
 * @param {string} userName
 * @returns {Promise<Array<{type: 'card'|'word', id: string, title: string, at: string}>>}
 */
async function listBookmarks(userName) {
    const map = await readMap(userName);
    const entries = Object.entries(map).map(([key, value]) => {
        const at = key.indexOf("#");
        return { type: key.slice(0, at), id: key.slice(at + 1), title: (value && value.title) || "", at: (value && value.at) || "" };
    }).filter((b) => b.type === "card" || b.type === "word");

    const cardIds = entries.filter((b) => b.type === "card").map((b) => b.id);
    const titles = cardIds.length ? await noteTitles(userName, cardIds) : {};
    const gone = entries.filter((b) => b.type === "card" && !(b.id in titles));
    if (gone.length) {
        // Deleted notes: drop their bookmarks too (never fails the list).
        await removeKeys(userName, gone.map((b) => keyOf(b.type, b.id)))
            .catch((err) => console.log(`bookmarks cleanup error: ${err.name || err}`));
    }
    return entries
        .filter((b) => b.type === "word" || b.id in titles)
        .map((b) => (b.type === "card" ? { ...b, title: titles[b.id] || b.title } : { ...b, title: b.id }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * Bookmark a note or word (PUT /bookmarks/:type/:id). Bookmarking one that's
 * already bookmarked keeps its place.
 *
 * @param {string} userName
 * @param {'card'|'word'} type
 * @param {string} id
 * @param {string} [title] how it's called now (shown if it can't be read later)
 * @param {string} [at] when it was first bookmarked, for Undo after removing
 *   one (it goes back to its place); otherwise now
 * @returns {Promise<{type, id, title, at}>}
 */
async function addBookmark(userName, type, id, title, at) {
    const key = checkedKey(type, id);
    const map = await readMap(userName);
    if (map[key]) return { type, id, title: map[key].title, at: map[key].at };
    if (Object.keys(map).length >= MAX_BOOKMARKS) {
        throw new BookmarkError(413, `You can have up to ${MAX_BOOKMARKS} bookmarks.`);
    }
    const given = typeof at === "string" ? new Date(at) : null;
    const when = given && !Number.isNaN(given.getTime()) && given.getTime() <= Date.now() ? given : new Date();
    const entry = { at: when.toISOString(), title: String(title || id).slice(0, MAX_TITLE) };
    const client = database.dynamoDbClientInstance();
    const params = {
        TableName: TABLE,
        Key: { user_name: userName },
        UpdateExpression: "SET #m.#k = if_not_exists(#m.#k, :entry)",
        ExpressionAttributeNames: { "#m": "bookmarks", "#k": key },
        ExpressionAttributeValues: { ":entry": entry },
    };
    try {
        await client.update(params).promise();
    } catch (err) {
        if (err.code !== "ValidationException" && err.name !== "ValidationException") throw err;
        // No bookmarks yet: make the map first, then add to it.
        await client.update({
            TableName: TABLE,
            Key: { user_name: userName },
            UpdateExpression: "SET bookmarks = if_not_exists(bookmarks, :empty)",
            ExpressionAttributeValues: { ":empty": {} },
        }).promise();
        await client.update(params).promise();
    }
    return { type, id, ...entry };
}

/** Remove bookmarks by map key (missing ones are fine). */
async function removeKeys(userName, keys) {
    const client = database.dynamoDbClientInstance();
    for (let start = 0; start < keys.length; start += 100) {
        const batch = keys.slice(start, start + 100);
        const names = { "#m": "bookmarks" };
        batch.forEach((key, i) => { names[`#k${i}`] = key; });
        try {
            await client.update({
                TableName: TABLE,
                Key: { user_name: userName },
                UpdateExpression: `REMOVE ${batch.map((_, i) => `#m.#k${i}`).join(", ")}`,
                ExpressionAttributeNames: names,
            }).promise();
        } catch (err) {
            // No bookmarks map at all: nothing to remove.
            if (err.code !== "ValidationException" && err.name !== "ValidationException") throw err;
        }
    }
}

/** Remove one bookmark (DELETE /bookmarks/:type/:id). */
async function removeBookmark(userName, type, id) {
    await removeKeys(userName, [checkedKey(type, id)]);
}

/** Remove every bookmark (DELETE /bookmarks). The notes stay as they are. */
async function clearBookmarks(userName) {
    await database.dynamoDbClientInstance().update({
        TableName: TABLE,
        Key: { user_name: userName },
        UpdateExpression: "REMOVE bookmarks",
    }).promise();
}

module.exports = { listBookmarks, addBookmark, removeBookmark, clearBookmarks, BookmarkError };
