// One definition of each word, picked at random, for the word cards in a
// notebook's list (the web's NotebookOverview and NotebookItemList show it
// in place of a plain "Word").
//
// The definitions are the ones already kept in the `dictionary` table (PK
// `word`, lower-cased): each row holds every definition found the first time
// anyone looked the word up, as [{ source, text }]. This only reads them;
// nothing is saved. A new pick is made on every request, so a notebook shows
// different definitions from one visit to the next.
const database = require("./dynamoDb");
const { htmlToText } = require("./notebook-search");

const TABLE = "dictionary";

// A notebook can hold many words; more than this in one request is refused
// rather than read (the list asks once per notebook opening).
const MAX_WORDS = 1000;

// Long definitions are cut here; the card shows two lines anyway.
const MAX_LENGTH = 280;

const normalizeWord = (word) => String(word || "").trim().toLowerCase();

/** One of the array's items, chosen at random. */
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * A random definition for each word that has any.
 *
 * @param {string[]} words as the notebook lists them (any case)
 * @returns {Promise<Object<string, string>>} word (as given) -> plain-text
 *   definition; words with none are left out
 */
async function randomDefinitions(words) {
    // Each word as asked, under the key the dictionary table uses.
    const asked = new Map();
    for (const w of Array.isArray(words) ? words : []) {
        if (typeof w !== "string") continue;
        const key = normalizeWord(w);
        if (!key) continue;
        if (!asked.has(key)) asked.set(key, []);
        asked.get(key).push(w);
    }
    if (asked.size > MAX_WORDS) {
        const err = new Error(`At most ${MAX_WORDS} words at a time.`);
        err.status = 400;
        throw err;
    }

    const out = {};
    const keys = [...asked.keys()];
    const client = database.dynamoDbClientInstance();
    // BatchGetItem reads up to 100 rows per call.
    for (let i = 0; i < keys.length; i += 100) {
        let request = {
            [TABLE]: {
                Keys: keys.slice(i, i + 100).map((word) => ({ word })),
                ProjectionExpression: "#w, definitions",
                ExpressionAttributeNames: { "#w": "word" },
            },
        };
        // DynamoDB may hand back some keys unread when busy; ask again a
        // few times.
        for (let attempt = 0; attempt < 3 && request && request[TABLE]; attempt++) {
            const data = await client.batchGet({ RequestItems: request }).promise();
            ((data.Responses && data.Responses[TABLE]) || []).forEach((row) => {
                const texts = (Array.isArray(row.definitions) ? row.definitions : [])
                    .map((d) => htmlToText(d && d.text))
                    .filter(Boolean);
                if (texts.length === 0) return;
                let text = pickOne(texts);
                if (text.length > MAX_LENGTH) text = `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
                (asked.get(row.word) || []).forEach((w) => { out[w] = text; });
            });
            request = data.UnprocessedKeys;
        }
    }
    return out;
}

module.exports = { randomDefinitions, MAX_WORDS };
