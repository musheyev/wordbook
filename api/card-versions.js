// Note history: earlier versions of each note, kept for 30 days, so a note
// can be brought back to how it was (the History window on a note).
//
// How versions are made ("copy on write"): each time a note is saved, the
// version it replaces is copied here first (cards.js updateCard hands over
// the old note, which DynamoDB returns from the same update, so there's no
// extra read and no race). The note itself stays where it always was, in
// dictionary_cards; this table only ever holds older copies. Restoring a
// version saves it as the note again, after keeping the current note as a
// version too ("Before restore"), so nothing is ever lost by restoring.
//
// Kept small:
//   - a save that changes nothing keeps nothing;
//   - several saves within 10 minutes keep one restore point: the version
//     from before the burst (a restore always keeps the current note);
//   - at most 50 versions per note, the oldest going first;
//   - each version expires 30 days after it was kept: DynamoDB's TTL
//     ("time to live") deletes rows whose `expires_at` time has passed, by
//     itself and at no cost (create-card-versions-table.js turns it on).
//   - A deleted note's last version is kept too ("deleted"), 30 days, so it
//     could be brought back.
//
// Table `dictionary_card_versions` (create-card-versions-table.js):
//   PK user_name, SK version_key = "<card_id>#<when it was kept, ISO time>"
//   attrs: card_id, title, content, saved_at (when that version was saved),
//          kept_at, reason ("edit" | "restore" | "deleted"), words, expires_at
// Keyed by user name like the other per-user tables, so deleting an account
// (account.js) removes a user's history with the rest.

// (Not notebook-search.js's htmlToText: that file loads wordbook.js, which
// loads cards.js, which loads this one, a circle Node can't finish.)
const database = require("./dynamoDb");

const TABLE = "dictionary_card_versions";
const KEEP_DAYS = 30;
const MAX_VERSIONS = 50;
const BURST_MS = 10 * 60 * 1000;

const client = () => database.dynamoDbClientInstance();
const keyPrefix = (cardId) => `${cardId}#`;
/** Words in a note's HTML: its text, split on spaces. */
const wordCount = (html) => {
    const text = String(html || "")
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&[a-z#0-9]+;/gi, "x")
        .replace(/\s+/g, " ")
        .trim();
    return text ? text.split(" ").length : 0;
};

/** Every version key of a note, oldest first (keys only). */
async function versionKeys(userName, cardId) {
    const keys = [];
    let start;
    do {
        const data = await client().query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u AND begins_with(version_key, :p)",
            ExpressionAttributeValues: { ":u": userName, ":p": keyPrefix(cardId) },
            ProjectionExpression: "version_key, kept_at, reason",
            ExclusiveStartKey: start,
        }).promise();
        keys.push(...(data.Items || []));
        start = data.LastEvaluatedKey;
    } while (start);
    return keys;
}

/**
 * Keep a version of a note that's about to be replaced (or deleted).
 *
 * @param {string} userName
 * @param {{card_id: string, title?: string, content?: string, updated_datetime?: string}} old
 *   the note as it was (DynamoDB's "ALL_OLD" answer from the update)
 * @param {{title?: string, content?: string}|null} next what replaces it
 *   (null when the note is being deleted)
 * @param {'edit'|'restore'|'deleted'} reason
 * @returns {Promise<string|null>} the new version's key, or null when none
 *   was kept (nothing changed, or within a burst of saves)
 */
async function keepVersion(userName, old, next, reason = "edit") {
    if (!old || !old.card_id) return null;
    const oldTitle = old.title || "";
    const oldContent = old.content || "";
    if (next && (next.title || "") === oldTitle && (next.content || "") === oldContent) return null;

    const existing = await versionKeys(userName, old.card_id);
    const now = new Date();
    if (reason === "edit" && existing.length) {
        const newest = existing[existing.length - 1];
        if (newest.reason === "edit" && now - Date.parse(newest.kept_at) < BURST_MS) return null;
    }

    const keptAt = now.toISOString();
    const versionKey = `${keyPrefix(old.card_id)}${keptAt}`;
    await client().put({
        TableName: TABLE,
        Item: {
            user_name: userName,
            version_key: versionKey,
            card_id: old.card_id,
            title: oldTitle,
            content: oldContent,
            saved_at: old.updated_datetime || old.added_datetime || keptAt,
            kept_at: keptAt,
            reason,
            words: wordCount(oldContent),
            expires_at: Math.floor(now.getTime() / 1000) + KEEP_DAYS * 24 * 60 * 60,
        },
    }).promise();

    // Over the cap: the oldest go.
    const extra = existing.length + 1 - MAX_VERSIONS;
    for (const row of existing.slice(0, Math.max(0, extra))) {
        await client().delete({ TableName: TABLE, Key: { user_name: userName, version_key: row.version_key } })
            .promise();
    }
    return versionKey;
}

/**
 * Keep a version without ever failing what's being saved: a history that
 * can't be written is logged, and the save goes on.
 */
async function keepVersionSafely(userName, old, next, reason) {
    try {
        return await keepVersion(userName, old, next, reason);
    } catch (err) {
        console.log(`keepVersion error: ${err.name || err}`);
        return null;
    }
}

/**
 * A note's versions, newest first, without their text (the History list).
 * Expired rows DynamoDB hasn't removed yet (it can take a day or two) are
 * left out.
 *
 * @returns {Promise<Array<{key, title, saved_at, kept_at, reason, words}>>}
 */
async function listVersions(userName, cardId) {
    const items = [];
    let start;
    do {
        const data = await client().query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u AND begins_with(version_key, :p)",
            ExpressionAttributeValues: { ":u": userName, ":p": keyPrefix(cardId) },
            ProjectionExpression: "version_key, title, saved_at, kept_at, reason, words, expires_at",
            ScanIndexForward: false,
            ExclusiveStartKey: start,
        }).promise();
        items.push(...(data.Items || []));
        start = data.LastEvaluatedKey;
    } while (start);
    const nowSec = Date.now() / 1000;
    return items
        .filter((it) => !it.expires_at || it.expires_at > nowSec)
        .map((it) => ({
            key: it.version_key,
            title: it.title || "",
            saved_at: it.saved_at,
            kept_at: it.kept_at,
            reason: it.reason || "edit",
            words: it.words || 0,
        }));
}

/**
 * One version with its text, or null when it isn't this user's note's.
 * @returns {Promise<{key, title, content, saved_at, reason}|null>}
 */
async function getVersion(userName, cardId, key) {
    if (!key || !String(key).startsWith(keyPrefix(cardId))) return null;
    const data = await client().get({ TableName: TABLE, Key: { user_name: userName, version_key: key } }).promise();
    const it = data.Item;
    if (!it) return null;
    return { key: it.version_key, title: it.title || "", content: it.content || "", saved_at: it.saved_at, reason: it.reason };
}

module.exports = { keepVersion, keepVersionSafely, listVersions, getVersion, wordCount, TABLE, KEEP_DAYS };
