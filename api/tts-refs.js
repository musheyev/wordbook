/**
 * Which read-aloud audio each item uses, so audio that's been replaced (the
 * text was edited, a language mark or voice changed) can be cleaned up by an
 * admin (Admin › Audio cleanup, see tts-gc.js).
 *
 * Audio files are shared: one file per voice + language + sentence
 * (tts.js audioKey), however many notes use that sentence. So instead of
 * owning files, items keep a list of the files they currently use:
 *
 *   dictionary_tts_refs      PK item_key, SK user_name, attr audio (list of keys)
 *     item_key is what's read aloud:
 *       card:<card_id>        a note
 *       wordnote:<word>       your own note on a word
 *       worddefs:<word>       a word page: the word and its definitions
 *       wordtitle:<word>      just the word (a notebook's "Play all")
 *     One row per user: people choose voices on their own devices, so two
 *     users reading the same word use different files.
 *
 *   dictionary_tts_released  PK audio_key, attr released_at
 *     Files an item stopped using. Only these can be cleaned up, and only
 *     if no item uses them any more. Audio no item has ever listed (e.g.
 *     made before this tracking existed) is never released, so it's left
 *     alone until the note it belongs to is read again.
 *
 * The app sends an item's list when it starts reading it aloud and when a
 * note is saved (setItemAudio); deleting a note drops its rows (removeItem).
 */
const db = require("./dynamoDb");
const tts = require("./tts");

const REFS = "dictionary_tts_refs";
const RELEASED = "dictionary_tts_released";
const ITEM_RE = /^(card|wordnote|worddefs|wordtitle):[^\n]{1,200}$/;
const MAX_CHUNKS = 3000;

/** An error the router reports with its own HTTP status and message. */
class TtsRefsError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function release(keys) {
    const now = new Date().toISOString();
    const table = db.dynamoDbClientInstance();
    for (let i = 0; i < keys.length; i += 25) {
        await table.batchWrite({
            RequestItems: {
                [RELEASED]: keys.slice(i, i + 25).map((audio_key) => ({
                    PutRequest: { Item: { audio_key, released_at: now } },
                })),
            },
        }).promise();
    }
}

/**
 * Replace the list of audio files `userName`'s reading of `item` uses.
 * Files dropped from the list are released for cleanup.
 *
 * @param {string} userName
 * @param {string} item e.g. "card:<card_id>"
 * @param {Array<{text: string, languageCode: string, voiceName?: string}>} chunks
 *   exactly what the app will request from /tts, in order
 * @returns {Promise<{audio: number, released: number}>}
 */
async function setItemAudio(userName, item, chunks) {
    if (typeof item !== "string" || !ITEM_RE.test(item)) {
        throw new TtsRefsError(400, "Unknown item.");
    }
    if (!Array.isArray(chunks) || chunks.length > MAX_CHUNKS) {
        throw new TtsRefsError(400, "Send the item's chunks as a list.");
    }
    const audio = [...new Set(chunks
        .filter((c) => c && typeof c.text === "string" && c.text.trim() && typeof c.languageCode === "string")
        .map((c) => tts.audioKey(c)))];

    const table = db.dynamoDbClientInstance();
    const key = { item_key: item, user_name: userName };
    const before = await table.get({ TableName: REFS, Key: key }).promise();
    const old = (before.Item && before.Item.audio) || [];

    if (audio.length === 0) {
        await table.delete({ TableName: REFS, Key: key }).promise();
    } else {
        await table.put({
            TableName: REFS,
            Item: { ...key, audio, updated_at: new Date().toISOString() },
        }).promise();
    }
    const dropped = old.filter((k) => !audio.includes(k));
    if (dropped.length) await release(dropped);
    return { audio: audio.length, released: dropped.length };
}

/**
 * An item is gone (a note deleted): drop every user's list for it and
 * release its files.
 *
 * @param {string} item
 */
async function removeItem(item) {
    const table = db.dynamoDbClientInstance();
    const rows = await table.query({
        TableName: REFS,
        KeyConditionExpression: "item_key = :item",
        ExpressionAttributeValues: { ":item": item },
    }).promise();
    const dropped = [];
    for (const row of rows.Items || []) {
        dropped.push(...(row.audio || []));
        await table.delete({ TableName: REFS, Key: { item_key: item, user_name: row.user_name } }).promise();
    }
    if (dropped.length) await release([...new Set(dropped)]);
}

/** One user's list for an item is gone (their own word note deleted). */
async function removeUserItem(userName, item) {
    await setItemAudio(userName, item, []);
}

async function scanAll(TableName, onItem) {
    const table = db.dynamoDbClientInstance();
    let ExclusiveStartKey;
    do {
        const page = await table.scan({ TableName, ExclusiveStartKey }).promise();
        (page.Items || []).forEach(onItem);
        ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
}

/** Every audio key some item uses now. */
async function referencedKeys() {
    const keys = new Set();
    await scanAll(REFS, (row) => (row.audio || []).forEach((k) => keys.add(k)));
    return keys;
}

/** Every released key: [{ audio_key, released_at }]. */
async function releasedKeys() {
    const out = [];
    await scanAll(RELEASED, (row) => out.push(row));
    return out;
}

/** Forget released keys (archived, or in use again). */
async function forgetReleased(keys) {
    const table = db.dynamoDbClientInstance();
    for (let i = 0; i < keys.length; i += 25) {
        await table.batchWrite({
            RequestItems: {
                [RELEASED]: keys.slice(i, i + 25).map((audio_key) => ({ DeleteRequest: { Key: { audio_key } } })),
            },
        }).promise();
    }
}

module.exports = {
    setItemAudio, removeItem, removeUserItem, referencedKeys, releasedKeys, forgetReleased,
    TtsRefsError, REFS, RELEASED,
};
