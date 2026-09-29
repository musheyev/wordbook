/**
 * Sharing and the Inbox: one user sends a word or note to another, and it
 * waits in the recipient's Inbox until they move it into a notebook or
 * remove it.
 *
 * Why a separate table
 * --------------------
 * Every other table is keyed by the *owner's* username, and every route only
 * touches the signed-in user's own rows. That keeps users' data private, but
 * it means nobody can read someone else's note. So sharing works by copying:
 *
 *   share   Alice's note is copied (title + content, frozen as it is now) into
 *           a row in Bob's partition of `dictionary_inbox`.
 *   move    The copy becomes a real note in Bob's `dictionary_cards` (with a
 *           new card_id) and is added to the notebook he picks. The inbox row
 *           is deleted.
 *   remove  The inbox row is deleted; nothing else was ever created.
 *
 * After a move, Alice's and Bob's notes are fully independent: either can
 * edit or delete theirs without affecting the other. Words need no copying —
 * a word is just its text.
 *
 * Table: dictionary_inbox (created by create-inbox-table.js)
 * -----------------------
 *   user_name  (partition key)  the recipient
 *   inbox_id   (sort key)       "<ISO time>#<uuid>" — sorts by time
 *   from_user, shared_at, item_type ("word"|"card"),
 *   word                         for words
 *   title, content, preview      for notes
 *
 * The same table also holds per-sender daily counters (see reserveShare),
 * under partition keys that start with "#quota#" so they never mix with a
 * user's inbox.
 *
 * Abuse limits and privacy
 * ------------------------
 * Anyone who knows a username can send to it, so:
 *   - a sender may share at most SHARES_PER_DAY items a day;
 *   - an inbox holds at most INBOX_LIMIT items; shares beyond that are dropped;
 *   - the sender always hears "Sent", whether or not the user exists, their
 *     inbox is full, or it's the sender themselves. Otherwise the reply would
 *     reveal which usernames have accounts. (Only the sender's own daily
 *     limit, and problems with the item they're sending, get a real error:
 *     those don't reveal anything about anyone else.)
 */
const crypto = require("crypto");
const database = require("./dynamoDb");
const cards = require("./cards");
const wordbook = require("./wordbook");
const { findUsername } = require("./cognitoUsers");
const log = require("./logger");

const TABLE = "dictionary_inbox";
const SHARES_PER_DAY = 20;
const INBOX_LIMIT = 200;
/**
 * Largest note that can be shared. A DynamoDB item may be at most 400 KB, and
 * the inbox row holds the content plus a few other attributes, so this leaves
 * headroom. Measured in bytes (UTF-8), which is what DynamoDB counts.
 */
const MAX_CONTENT_BYTES = 350 * 1024;
const MAX_WORD_LENGTH = 100;

/**
 * An error the router should report to the user with a specific HTTP status
 * and message (anything else becomes a generic 500).
 */
class InboxError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Count one share against the sender's daily limit, or refuse if they've
 * already used it up.
 *
 * The counter is a single row, e.g. { user_name: "#quota#alice",
 * inbox_id: "shares#2026-09-26", share_count: 7 }. The update below is
 * *atomic*: DynamoDB checks the condition and adds 1 in one step, so two
 * shares sent at the same instant can't both squeeze past the limit — which a
 * separate "read the count, then write count + 1" could allow.
 *
 * A new day (UTC) means a new row, so the limit resets at midnight UTC. Old
 * counter rows are tiny and harmless; a DynamoDB TTL could expire them later.
 *
 * @param {string} sender
 * @throws {InboxError} 429 when the daily limit is reached
 */
async function reserveShare(sender) {
    const today = new Date().toISOString().slice(0, 10);
    try {
        await database.dynamoDbClientInstance().update({
            TableName: TABLE,
            Key: { user_name: `#quota#${sender}`, inbox_id: `shares#${today}` },
            UpdateExpression: "ADD share_count :one",
            ConditionExpression: "attribute_not_exists(share_count) OR share_count < :max",
            ExpressionAttributeValues: { ":one": 1, ":max": SHARES_PER_DAY },
        }).promise();
    } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
            throw new InboxError(429, `You can share up to ${SHARES_PER_DAY} items a day. Try again tomorrow.`);
        }
        throw err;
    }
}

/**
 * How many items are in a user's inbox. `Select: "COUNT"` makes DynamoDB
 * return only the number, not the items. A query reads at most 1 MB per call,
 * so large inboxes come back in pages, followed via LastEvaluatedKey.
 *
 * @param {string} userName
 * @returns {Promise<number>}
 */
async function countInbox(userName) {
    let count = 0;
    let lastKey;
    do {
        const page = await database.dynamoDbClientInstance().query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u",
            ExpressionAttributeValues: { ":u": userName },
            Select: "COUNT",
            ExclusiveStartKey: lastKey,
        }).promise();
        count += page.Count || 0;
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);
    return count;
}

/**
 * Turn what the sender asked to share into the attributes stored in the
 * inbox row, checking it's something they're allowed and able to share.
 *
 * @param {string} sender
 * @param {{type: string, id: string}} item
 * @returns {Promise<object>} attributes for the inbox row
 * @throws {InboxError} 400/404/413 for a bad, missing or oversized item
 */
async function snapshotItem(sender, item) {
    if (!item || !["word", "card", "notebook"].includes(item.type) || typeof item.id !== "string") {
        throw new InboxError(400, "Choose a word, note or notebook to share.");
    }

    if (item.type === "word") {
        const word = item.id.trim();
        if (word === "" || word.length > MAX_WORD_LENGTH) {
            throw new InboxError(400, "That word can't be shared.");
        }
        return { item_type: "word", word };
    }

    // A whole notebook: freeze its words and its notes' content so the recipient
    // gets an independent copy (same philosophy as sharing a single note).
    if (item.type === "notebook") {
        const name = item.id.trim();
        if (name === "") {
            throw new InboxError(400, "Choose a notebook to share.");
        }
        if (!await wordbook._wordbookExists(sender, name)) {
            throw new InboxError(404, "That notebook doesn't exist.");
        }
        const notebook = await wordbook._notebookItemsForUser(sender, name);
        if (notebook.words.length + notebook.cards.length === 0) {
            throw new InboxError(400, "That notebook is empty.");
        }
        if (Buffer.byteLength(JSON.stringify(notebook), "utf8") > MAX_CONTENT_BYTES) {
            throw new InboxError(413, "This notebook is too large to share.");
        }
        return {
            item_type: "notebook",
            title: name,
            notebook,
            word_count: notebook.words.length,
            note_count: notebook.cards.length,
        };
    }

    // Only the sender's own notes can be shared: we look the card up in their
    // partition, so a card_id belonging to someone else simply isn't found.
    const card = await cards._getCardForUser(sender, item.id);
    if (!card) {
        throw new InboxError(404, "That note doesn't exist.");
    }
    if (Buffer.byteLength(card.content, "utf8") > MAX_CONTENT_BYTES) {
        throw new InboxError(413, "This note is too large to share.");
    }
    return {
        item_type: "card",
        title: card.title,
        content: card.content,
        preview: cards._previewText(card.content),
    };
}

/**
 * Share a word or note with another user (POST /inbox/share).
 *
 * Order of checks: the item first (so the sender learns if *their* item is
 * the problem), then their daily limit, then the recipient. Anything about
 * the recipient — unknown user, full inbox — is silent, and the caller always
 * replies "Sent".
 *
 * @param {string} sender username from the verified token, never the request
 * @param {string} to recipient username as typed
 * @param {{type: "word"|"card", id: string}} item
 * @returns {Promise<void>}
 */
async function shareItem(sender, to, item) {
    const snapshot = await snapshotItem(sender, item);
    await reserveShare(sender);

    const recipient = typeof to === "string" && to.trim() ? await findUsername(to.trim()) : null;
    if (!recipient) {
        log(`share from ${sender}: no such user "${to}" (reported as sent)`);
        return;
    }
    if (await countInbox(recipient) >= INBOX_LIMIT) {
        log(`share from ${sender}: inbox of ${recipient} is full (reported as sent)`);
        return;
    }

    const now = new Date().toISOString();
    await database.dynamoDbClientInstance().put({
        TableName: TABLE,
        Item: {
            ...snapshot,
            user_name: recipient,
            inbox_id: `${now}#${crypto.randomUUID()}`,
            from_user: sender,
            shared_at: now,
        },
    }).promise();
}

/**
 * The user's inbox, newest first (GET /inbox).
 *
 * `ScanIndexForward: false` reads the partition in *descending* sort-key
 * order; since inbox_id starts with the time, that's newest first. The
 * ProjectionExpression leaves out `content` so the list stays small — the
 * full note is fetched only when one is opened (getItem).
 *
 * @param {string} userName
 * @returns {Promise<Array<{id, type, title, preview, from, sharedAt}>>}
 */
async function listInbox(userName) {
    const items = [];
    let lastKey;
    do {
        const page = await database.dynamoDbClientInstance().query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u",
            ExpressionAttributeValues: { ":u": userName },
            ProjectionExpression: "inbox_id, item_type, word, #title, preview, from_user, shared_at, word_count, note_count",
            // "title" isn't a DynamoDB reserved word, but aliasing attribute
            // names (#title) is a good habit: reserved words fail at runtime.
            ExpressionAttributeNames: { "#title": "title" },
            ScanIndexForward: false,
            ExclusiveStartKey: lastKey,
        }).promise();
        items.push(...(page.Items || []));
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    return items.map(toListEntry);
}

/** Shape an inbox row for the frontend's list (no note body). */
function toListEntry(row) {
    if (row.item_type === "notebook") {
        const words = row.word_count || 0;
        const notes = row.note_count || 0;
        const part = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
        return {
            id: row.inbox_id,
            type: "notebook",
            title: row.title || "(untitled notebook)",
            preview: [words ? part(words, 'word') : null, notes ? part(notes, 'note') : null]
                .filter(Boolean).join(' · '),
            from: row.from_user,
            sharedAt: row.shared_at,
        };
    }
    const isCard = row.item_type === "card";
    return {
        id: row.inbox_id,
        type: isCard ? "card" : "word",
        title: isCard ? (row.title || "(untitled note)") : row.word,
        preview: isCard ? (row.preview || "") : "",
        from: row.from_user,
        sharedAt: row.shared_at,
    };
}

/**
 * Read one inbox row by id, or throw 404. Because the key includes the
 * signed-in user's name, a user can only ever read their own inbox rows.
 *
 * @param {string} userName
 * @param {string} inboxId
 * @returns {Promise<object>} the full row
 */
async function readRow(userName, inboxId) {
    if (typeof inboxId !== "string" || inboxId === "") {
        throw new InboxError(400, "Missing inbox item.");
    }
    const data = await database.dynamoDbClientInstance().get({
        TableName: TABLE,
        Key: { user_name: userName, inbox_id: inboxId },
    }).promise();
    if (!data.Item) {
        throw new InboxError(404, "That item is no longer in your inbox.");
    }
    return data.Item;
}

/**
 * One inbox item in full, including a note's content (POST /inbox/get).
 *
 * @param {string} userName
 * @param {string} inboxId
 */
async function getItem(userName, inboxId) {
    const row = await readRow(userName, inboxId);
    return { ...toListEntry(row), content: row.item_type === "card" ? (row.content || "") : undefined };
}

/**
 * Move an inbox item into one of the user's notebooks (POST /inbox/move).
 *
 * Writes the new data first and deletes the inbox row last. If anything fails
 * part-way, the item is still in the inbox and the user can simply try again;
 * the reverse order could lose the item.
 *
 * @param {string} userName
 * @param {string} inboxId
 * @param {string} wordbookName target notebook
 * @returns {Promise<{type: string, id: string}>} the item as it now appears in
 *   the notebook (a note's new card_id, or the word), so the app can open it
 */
async function moveItem(userName, inboxId, wordbookName) {
    const row = await readRow(userName, inboxId);

    // A shared notebook becomes a brand-new notebook (the recipient names it),
    // not an item moved into an existing one.
    if (row.item_type === "notebook") {
        return acceptNotebook(userName, row, wordbookName);
    }

    // Check the target first, so a bad notebook name never leaves a stray
    // note copy behind.
    if (!await wordbook._wordbookExists(userName, wordbookName)) {
        throw new InboxError(404, `Notebook "${wordbookName}" doesn't exist.`);
    }

    let item;
    if (row.item_type === "card") {
        // The recipient's own, independent copy of the note. shared_by /
        // shared_at record where it came from.
        const card = await cards._createCardForUser(userName, row.title, row.content, {
            shared_by: row.from_user,
            shared_at: row.shared_at,
        });
        item = { type: "card", id: card.card_id };
    } else {
        item = { type: "word", id: row.word };
    }

    const added = await wordbook._addItemForUser(userName, wordbookName, item);
    if (!added) {
        // Only if the notebook was deleted in the instant since the check
        // above. The inbox row stays, so nothing is lost.
        throw new InboxError(404, `Notebook "${wordbookName}" doesn't exist.`);
    }

    await removeItem(userName, inboxId);
    return item;
}

/**
 * Accept a shared notebook: create a new notebook (named by the recipient),
 * copy every word and a fresh independent copy of every note into it, then
 * delete the inbox row. Creating the notebook first means a name clash is
 * caught before anything is copied.
 *
 * @param {string} userName recipient
 * @param {object} row the notebook inbox row (with row.notebook)
 * @param {string} newName the recipient's chosen name
 * @returns {Promise<{type: "notebook", name: string}>}
 */
async function acceptNotebook(userName, row, newName) {
    const notebook = row.notebook || { words: [], cards: [] };

    let name;
    try {
        name = await wordbook._addWordbookForUser(userName, newName);
    } catch (err) {
        if (err.code === "WORDBOOK_EXISTS") {
            throw new InboxError(409, "You already have a notebook with that name. Choose another.");
        }
        if (err.code === "INVALID_NAME") {
            throw new InboxError(400, err.message);
        }
        throw err;
    }

    for (const word of notebook.words) {
        await wordbook._addItemForUser(userName, name, { type: "word", id: word });
    }
    for (const c of notebook.cards) {
        const card = await cards._createCardForUser(userName, c.title, c.content, {
            shared_by: row.from_user,
            shared_at: row.shared_at,
        });
        await wordbook._addItemForUser(userName, name, { type: "card", id: card.card_id });
    }

    await removeItem(userName, row.inbox_id);
    return { type: "notebook", name };
}

/**
 * Delete an inbox item (POST /inbox/remove). Deleting a row that's already
 * gone is not an error in DynamoDB, so removing twice is harmless.
 *
 * @param {string} userName
 * @param {string} inboxId
 */
async function removeItem(userName, inboxId) {
    await database.dynamoDbClientInstance().delete({
        TableName: TABLE,
        Key: { user_name: userName, inbox_id: inboxId },
    }).promise();
}

module.exports = {
    InboxError,
    shareItem,
    listInbox,
    getItem,
    moveItem,
    removeItem,
    SHARES_PER_DAY,
    INBOX_LIMIT,
};
