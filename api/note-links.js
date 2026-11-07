// Note links: which notes link to which (the "Links to" and "Linked from"
// lists under a note). A note links to another in one of two ways:
//
//   - In its text: an ordinary link whose address names another note or word
//     (web/src/client/utils/noteLinks.js). Read from the note at every save.
//       <a href="/note/card/3f2c…">Spanish verbs</a>     a note, by its id
//       <a href="/note/word/hablar">hablar</a>           a word (its definitions and your note)
//   - Added: "🔗 Add link" in the row beside the note's tags
//     (NoteLinksRow.js), kept here only — the note's text isn't touched.
//     setAddedLinks saves them.
//
// "Links to" can be read from the note itself, but "Linked from" can't: it
// would mean reading every note. So each save records the note's links in
// `dictionary_note_links` (PK user_name, SK link_key), two kinds of rows:
//
//   out#<type>#<id>                      one per note that has links:
//                                        { targets: [{ type, id }] } the ones
//                                        in its text, in the order they
//                                        appear, and { added: [{ type, id }] }
//                                        the ones added in the row
//   in#<toType>#<toId>#<fromType>#<fromId>
//                                        one per link, kept under the note it
//                                        points to: { from_type, from_id,
//                                        from_title }
//
// so "Linked from" is one query for the rows starting "in#card#<id>#".
// Ids in keys are URI-encoded, so a "#" in a word can't confuse them.
// Words are keyed in lower case, as word notes are (word-notes.js).
//
// recordLinks runs after every save of a note or a word's note (and after a
// note is deleted): it compares the links with the ones recorded last time
// and adds or removes rows to match. A save changes only the links in the
// text; the added ones stay (deleting a note removes both).
const database = require("./dynamoDb");
const getCurentUserFromToken = require("./auth").getCurentUserFromToken;

const TABLE = "dictionary_note_links";
const CARDS_TABLE = "dictionary_cards";
const MAX_LINKS = 200;
const NOTE_HREF = /href\s*=\s*"\/note\/(card|word)\/([^"/?#]+)"/gi;

const normalizeWord = (word) => String(word || "").trim().toLowerCase();
/** An item's id as kept here: words in lower case. */
const keyId = (type, id) => (type === "word" ? normalizeWord(id) : String(id || ""));
const enc = encodeURIComponent;
const outKey = (type, id) => `out#${type}#${enc(keyId(type, id))}`;
const inPrefix = (type, id) => `in#${type}#${enc(keyId(type, id))}#`;
const inKey = (to, from) => `${inPrefix(to.type, to.id)}${from.type}#${enc(keyId(from.type, from.id))}`;

/**
 * The notes and words a note's HTML links to, each once, in order.
 * @param {string} html
 * @returns {Array<{type: 'card'|'word', id: string}>}
 */
function linksIn(html) {
    const seen = new Set();
    const out = [];
    for (const match of String(html || "").matchAll(NOTE_HREF)) {
        let id;
        try { id = decodeURIComponent(match[2]); } catch (e) { continue; }
        const type = match[1].toLowerCase();
        const key = `${type}#${keyId(type, id)}`;
        if (!id.trim() || seen.has(key)) continue;
        seen.add(key);
        // Keyed in lower case, but a word keeps its spelling for the lists.
        out.push({ type, id: type === "word" ? id.trim() : id });
        if (out.length >= MAX_LINKS) break;
    }
    return out;
}

/**
 * A note's HTML with its note links turned into plain text (the link's
 * words stay). For a note shared with someone else: they don't have the
 * notes it links to (inbox.js).
 * @param {string} html
 * @returns {string}
 */
function unlinkNotes(html) {
    return String(html || "").replace(/<a\b[^>]*\bhref\s*=\s*"\/note\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, "$1");
}

/** Put and delete rows, 25 at a time (DynamoDB's limit), retrying what's left over. */
async function writeRows(userName, puts, deleteKeys) {
    const requests = [
        ...puts.map((Item) => ({ PutRequest: { Item: { user_name: userName, ...Item } } })),
        ...deleteKeys.map((link_key) => ({ DeleteRequest: { Key: { user_name: userName, link_key } } })),
    ];
    const client = database.dynamoDbClientInstance();
    for (let i = 0; i < requests.length; i += 25) {
        let batch = { [TABLE]: requests.slice(i, i + 25) };
        for (let tries = 0; batch && Object.keys(batch).length && tries < 5; tries++) {
            const res = await client.batchWrite({ RequestItems: batch }).promise();
            batch = res.UnprocessedItems;
            if (batch && Object.keys(batch).length) await new Promise((r) => setTimeout(r, 100 * (tries + 1)));
        }
    }
}

/** Each link once (by type and id), in order, leaving out a link to `self`. */
function uniqueLinks(list, self) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((t) => {
        if (!t || !["card", "word"].includes(t.type) || !String(t.id || "").trim()) return;
        const key = `${t.type}#${keyId(t.type, t.id)}`;
        if (seen.has(key) || (self && t.type === self.type && keyId(t.type, t.id) === self.id)) return;
        seen.add(key);
        out.push({ type: t.type, id: t.type === "word" ? String(t.id).trim() : String(t.id) });
    });
    return out.slice(0, MAX_LINKS);
}

/** A note's recorded links: { targets (in its text), added (in the row), row (or null) }. */
async function recordedLinks(userName, fromItem) {
    const client = database.dynamoDbClientInstance();
    const before = await client.get({ TableName: TABLE, Key: { user_name: userName, link_key: outKey(fromItem.type, fromItem.id) } }).promise();
    const row = before.Item || null;
    return {
        row,
        targets: row && Array.isArray(row.targets) ? row.targets : [],
        added: row && Array.isArray(row.added) ? row.added : [],
    };
}

/**
 * Write a note's links: its out# row and an in# row under each note it
 * links to (in its text or added), adding and removing rows to match what
 * was recorded before.
 */
async function writeLinks(userName, fromItem, title, before, targets, added) {
    const all = uniqueLinks([...targets, ...added]);
    const was = uniqueLinks([...before.targets, ...before.added]);
    const now = all.map((t) => inKey(t, fromItem));
    const gone = was.map((t) => inKey(t, fromItem)).filter((key) => !now.includes(key));
    const puts = all.map((t) => ({
        link_key: inKey(t, fromItem), from_type: fromItem.type, from_id: fromItem.id, from_title: title,
    }));
    const deletes = [...gone];
    if (all.length) {
        puts.push({ link_key: outKey(fromItem.type, fromItem.id), targets, added, from_title: title, updated_at: new Date().toISOString() });
    } else if (before.row) {
        deletes.push(outKey(fromItem.type, fromItem.id));
    }
    await writeRows(userName, puts, deletes);
}

/**
 * Record a note's links after it's saved (or deleted). Only the links in
 * its text change; the added ones stay, unless the note was deleted.
 * Never throws for the caller's sake: the save itself already worked, so a
 * problem here is logged and the lists catch up at the next save.
 *
 * @param {string} userName
 * @param {{type: 'card'|'word', id: string, title?: string}} from the saved note (a word: its note)
 * @param {string} html its content now ('' when deleted)
 * @param {{deleted?: boolean}} [options] deleted: the note is gone, so its added links go too
 */
async function recordLinks(userName, from, html, { deleted = false } = {}) {
    try {
        const fromItem = { type: from.type, id: keyId(from.type, from.id) };
        if (!userName || !fromItem.id) return;
        // A link to itself isn't listed.
        const targets = uniqueLinks(linksIn(html), fromItem);
        const before = await recordedLinks(userName, fromItem);
        const added = deleted ? [] : before.added;
        const title = from.type === "word" ? fromItem.id : String(from.title || (before.row && before.row.from_title) || "");
        const sameTargets = JSON.stringify(before.targets) === JSON.stringify(targets);
        const sameAdded = JSON.stringify(before.added) === JSON.stringify(added);
        if (sameTargets && sameAdded && (!before.row || before.row.from_title === title)) return;
        await writeLinks(userName, fromItem, title, before, targets, added);
    } catch (err) {
        console.log(`recordLinks error: ${err.name || err}`);
    }
}

/**
 * Save the links added to a note in its row ("🔗 Add link"), replacing the
 * ones added before. The links in its text stay as they are.
 *
 * @param {string} userName
 * @param {{type: 'card'|'word', id: string, title?: string}} from the note (or word)
 * @param {Array<{type: 'card'|'word', id: string}>} links in the order shown
 */
async function setAddedLinks(userName, from, links) {
    const fromItem = { type: from.type, id: keyId(from.type, from.id) };
    const added = uniqueLinks(links, fromItem);
    const before = await recordedLinks(userName, fromItem);
    const title = from.type === "word" ? fromItem.id : String(from.title || (before.row && before.row.from_title) || "");
    await writeLinks(userName, fromItem, title, before, before.targets, added);
}

/**
 * recordLinks for the signed-in user (the routes have their token). Never
 * throws either.
 * @param {string} token the id_token cookie
 * @param {{type: 'card'|'word', id: string, title?: string}} from
 * @param {string} html
 * @param {{deleted?: boolean}} [options]
 */
async function recordLinksForToken(token, from, html, options) {
    try {
        const userName = await getCurentUserFromToken(token);
        await recordLinks(userName, from, html, options);
    } catch (err) {
        console.log(`recordLinks error: ${err.name || err}`);
    }
}

/** Titles of the user's notes, by id (missing ones are left out). */
async function noteTitles(userName, ids) {
    const titles = {};
    const client = database.dynamoDbClientInstance();
    for (let i = 0; i < ids.length; i += 100) {
        let keys = ids.slice(i, i + 100).map((card_id) => ({ user_name: userName, card_id }));
        for (let tries = 0; keys && keys.length && tries < 5; tries++) {
            const res = await client.batchGet({
                RequestItems: { [CARDS_TABLE]: { Keys: keys, ProjectionExpression: "card_id, title" } },
            }).promise();
            ((res.Responses && res.Responses[CARDS_TABLE]) || []).forEach((row) => { titles[row.card_id] = row.title || ""; });
            const left = res.UnprocessedKeys && res.UnprocessedKeys[CARDS_TABLE];
            keys = left ? left.Keys : null;
        }
    }
    return titles;
}

/**
 * A note's or word's links, both ways (GET /note-links).
 *
 * @param {string} userName
 * @param {'card'|'word'} type
 * @param {string} id
 * linksTo: the added links first (`added: true`, in the order added), then
 * the ones only in its text; a link that's in both is `added` and `inText`.
 *
 * @returns {Promise<{linksTo: Array<{type, id, title, added?: true, inText?: true, missing?: true}>, linkedFrom: Array<{type, id, title}>}>}
 */
async function linksFor(userName, type, id) {
    const client = database.dynamoDbClientInstance();
    const out = await client.get({ TableName: TABLE, Key: { user_name: userName, link_key: outKey(type, id) } }).promise();
    const inText = out.Item && Array.isArray(out.Item.targets) ? out.Item.targets : [];
    const added = out.Item && Array.isArray(out.Item.added) ? out.Item.added : [];
    const keyOf = (t) => `${t.type}#${keyId(t.type, t.id)}`;
    const addedKeys = new Set(added.map(keyOf));
    const textKeys = new Set(inText.map(keyOf));
    const targets = uniqueLinks([...added, ...inText]);

    const linkedFrom = [];
    let lastKey;
    do {
        const page = await client.query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u AND begins_with(link_key, :p)",
            ExpressionAttributeValues: { ":u": userName, ":p": inPrefix(type, id) },
            ExclusiveStartKey: lastKey,
        }).promise();
        (page.Items || []).forEach((row) => linkedFrom.push({ type: row.from_type, id: row.from_id, title: row.from_title || row.from_id }));
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    // Titles as they are now (a note may have been renamed since), and which
    // linked notes are gone.
    const cardIds = [...new Set([...targets, ...linkedFrom].filter((t) => t.type === "card").map((t) => t.id))];
    const titles = cardIds.length ? await noteTitles(userName, cardIds) : {};
    const linksTo = targets.map((t) => ({
        ...(t.type === "word"
            ? { type: "word", id: t.id, title: t.id }
            : t.id in titles ? { type: "card", id: t.id, title: titles[t.id] } : { type: "card", id: t.id, title: "", missing: true }),
        ...(addedKeys.has(keyOf(t)) ? { added: true } : {}),
        ...(textKeys.has(keyOf(t)) ? { inText: true } : {}),
    }));
    return {
        linksTo,
        linkedFrom: linkedFrom
            .filter((f) => f.type !== "card" || f.id in titles)
            .map((f) => (f.type === "card" ? { ...f, title: titles[f.id] } : f))
            .sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: "base" })),
    };
}

module.exports = { recordLinks, recordLinksForToken, setAddedLinks, linksFor, linksIn, unlinkNotes, noteTitles, TABLE };
