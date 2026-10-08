/**
 * Full-text search inside one notebook (GET /wordbook/search).
 *
 * Looks at, for each item:
 *   note   its title and its whole text
 *   word   the word, and the user's own note on it ("Your note")
 *   + with definitions: the word's dictionary definitions too
 * and returns the items that match, each with the passage around the first
 * match and where it was found, so the app can show it without downloading
 * every note.
 *
 * Matching ignores capitals, accents and Hebrew vowel marks: "como" finds
 * "¿Cómo estás?", and plain "שלום" finds it written with niqqud. The passage
 * is cut from the original text, so it shows exactly as written.
 */
const db = require("./dynamoDb");
const wordbook = require("./wordbook");
const getCurentUserFromToken = require("./auth").getCurentUserFromToken;

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;
const MAX_QUERY = 100;

/** An error the router reports with its own HTTP status and message. */
class SearchError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Plain text from note HTML: tags out, blocks separated, common entities
// decoded, whitespace squeezed.
function htmlToText(html) {
    return String(html || "")
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

// Text folded for matching (lower case; accents and other combining marks,
// incl. Hebrew niqqud, removed), with map[i] = index in the original text of
// folded character i, so a match can be cut out of the original.
function fold(text) {
    let folded = "";
    const map = [];
    let i = 0;
    for (const ch of text) {
        const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        for (const c of base) {
            folded += c;
            map.push(i);
        }
        i += ch.length;
    }
    return { folded, map };
}

const foldQuery = (q) => fold(String(q || "").trim().replace(/\s+/g, " ")).folded;

// The passage around the first match of `query` (already folded) in `text`,
// as { before, match, after }, or null.
function findIn(text, query) {
    if (!text || !query) return null;
    const { folded, map } = fold(text);
    const at = folded.indexOf(query);
    if (at === -1) return null;
    const start = map[at];
    const end = at + query.length < map.length ? map[at + query.length] : text.length;
    let from = Math.max(0, start - SNIPPET_BEFORE);
    let to = Math.min(text.length, end + SNIPPET_AFTER);
    // Don't cut words in half at the edges.
    if (from > 0) { const sp = text.indexOf(" ", from); if (sp !== -1 && sp < start) from = sp + 1; }
    if (to < text.length) { const sp = text.lastIndexOf(" ", to); if (sp > end) to = sp; }
    return {
        before: (from > 0 ? "…" : "") + text.slice(from, start),
        match: text.slice(start, end),
        after: text.slice(end, to) + (to < text.length ? "…" : ""),
    };
}

async function getItem(TableName, Key, ProjectionExpression, ExpressionAttributeNames) {
    try {
        const data = await db.dynamoDbClientInstance().get({ TableName, Key, ProjectionExpression, ExpressionAttributeNames }).promise();
        return data.Item || null;
    } catch (err) {
        return null; // one unreadable item doesn't fail the search
    }
}

/**
 * @param {string} userIdToken
 * @param {string} wordbookName
 * @param {string} q what to look for
 * @param {{definitions?: boolean}} options also search dictionary definitions
 * @returns {Promise<Array<{type, id, title, where, snippet}>>} in notebook
 *   order; `where` is "title", "note", "word-note" or "definition"
 */
async function searchNotebook(userIdToken, wordbookName, q, { definitions = false } = {}) {
    const query = foldQuery(q);
    if (query.length < 2) throw new SearchError(400, "Type at least 2 letters.");
    if (query.length > MAX_QUERY) throw new SearchError(400, "That search is too long.");

    const userName = await getCurentUserFromToken(userIdToken);
    const items = await wordbook.listofWords(userIdToken, wordbookName);
    if (!Array.isArray(items)) return [];

    const results = await Promise.all(items.map(async (item) => {
        const title = item.title || "";
        const hit = (where, snippet) => ({ type: item.type, id: item.id, title, where, snippet });

        const inTitle = findIn(title, query);
        if (inTitle) return hit("title", inTitle);

        if (item.type === "card") {
            const card = await getItem("dictionary_cards", { user_name: userName, card_id: item.id },
                "#content", { "#content": "content" });
            const inNote = card && findIn(htmlToText(card.content), query);
            return inNote ? hit("note", inNote) : null;
        }

        const word = String(item.id || "").trim().toLowerCase();
        const note = await getItem("dictionary_word_notes", { user_name: userName, word },
            "#content", { "#content": "content" });
        const inWordNote = note && findIn(htmlToText(note.content), query);
        if (inWordNote) return hit("word-note", inWordNote);

        if (definitions) {
            const entry = await getItem("dictionary", { word }, "definitions");
            for (const d of (entry && entry.definitions) || []) {
                const inDef = findIn(htmlToText(d.text), query);
                if (inDef) return hit("definition", inDef);
            }
        }
        return null;
    }));
    return results.filter(Boolean);
}

module.exports = { searchNotebook, SearchError, findIn, foldQuery, htmlToText };
