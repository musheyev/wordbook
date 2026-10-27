// Saved quizzes ("My Quizzes"). A quiz is saved as a copy of its cards, as
// they were when it was saved (the user's decision): editing or deleting a
// note later doesn't change it, and a card removed from the quiz stays gone.
//
// One row per quiz in `dictionary_quizzes` (PK user_name, SK quiz_id):
//
//   quiz_id     made by the app ("q-…"), so a quiz saved offline on the
//               iPhone already has its id and can be sent later as is
//   name        "Spanish verbs"
//   notebook    the notebook it came from (the "From" link opens notes there)
//   cards       [{ foreign, english, source }] — each side is
//               { text, lang, chunks } (chunks: what's read aloud, the same
//               as Play all, so the downloaded audio is used offline);
//               source is the note: { type, id, title }
//   created_at, updated_at
//
// DynamoDB keeps a row up to 400 KB, so a quiz is capped well below that.
const database = require("./dynamoDb");

const TABLE = "dictionary_quizzes";
const MAX_NAME = 100;
const MAX_CARDS = 500;
const MAX_BYTES = 350 * 1024;
const ID = /^q-[a-z0-9]{6,40}$/;

/** A refusal with a status code and a message for the user. */
class QuizError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Every saved quiz of a user, newest change first, with its cards (so the
 * phone keeps them all for offline use from this one answer).
 *
 * @param {string} userName
 * @returns {Promise<Array<{id, name, notebook, cards, createdAt, updatedAt}>>}
 */
async function listQuizzes(userName) {
    const rows = [];
    let lastKey;
    do {
        const page = await database.dynamoDbClientInstance().query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u",
            ExpressionAttributeValues: { ":u": userName },
            ExclusiveStartKey: lastKey,
        }).promise();
        rows.push(...(page.Items || []));
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);
    return rows
        .map((row) => ({
            id: row.quiz_id,
            name: row.name,
            notebook: row.notebook || "",
            cards: Array.isArray(row.cards) ? row.cards : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/**
 * Save a quiz: a new one, or the whole of an existing one (its name and
 * cards replaced). Keeps the first save's created_at.
 *
 * @param {string} userName
 * @param {string} id "q-…", made by the app
 * @param {{name: string, notebook: string, cards: object[]}} quiz
 * @throws {QuizError} 400 for a bad id, name or cards, 413 when too big
 */
async function saveQuiz(userName, id, { name, notebook, cards } = {}) {
    if (!ID.test(String(id))) throw new QuizError(400, "Bad quiz id.");
    const cleanName = typeof name === "string" ? name.trim().slice(0, MAX_NAME) : "";
    if (!cleanName) throw new QuizError(400, "The quiz needs a name.");
    if (!Array.isArray(cards) || cards.some((c) => !c || typeof c !== "object" || !c.foreign || !c.english)) {
        throw new QuizError(400, "Bad quiz cards.");
    }
    if (cards.length > MAX_CARDS) throw new QuizError(413, `A quiz can have up to ${MAX_CARDS} cards.`);
    if (Buffer.byteLength(JSON.stringify(cards)) > MAX_BYTES) throw new QuizError(413, "This quiz is too big to save.");

    const now = new Date().toISOString();
    await database.dynamoDbClientInstance().update({
        TableName: TABLE,
        Key: { user_name: userName, quiz_id: id },
        UpdateExpression: "SET #n = :name, notebook = :nb, cards = :cards, updated_at = :now, "
            + "created_at = if_not_exists(created_at, :now)",
        ExpressionAttributeNames: { "#n": "name" }, // "name" is a DynamoDB reserved word
        ExpressionAttributeValues: {
            ":name": cleanName,
            ":nb": typeof notebook === "string" ? notebook : "",
            ":cards": cards,
            ":now": now,
        },
    }).promise();
    return { id, name: cleanName, updatedAt: now };
}

/** Delete a quiz. Deleting one that's already gone is fine (it may have been deleted on another device). */
async function deleteQuiz(userName, id) {
    if (!ID.test(String(id))) throw new QuizError(400, "Bad quiz id.");
    await database.dynamoDbClientInstance().delete({
        TableName: TABLE,
        Key: { user_name: userName, quiz_id: id },
    }).promise();
}

module.exports = { listQuizzes, saveQuiz, deleteQuiz, QuizError, TABLE };
