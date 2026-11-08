// Stretch quizzes and second opinions: the two places the app asks OpenAI's
// language model for help (routes in routes/quizzesRouter.js, admins only).
//
//   makeStretchCards  — new flash cards written from your own notes, a
//                       little (or a lot) beyond them: the "Stretch" dial
//                       0 As written · 1 Remix · 2 Conversation · 3 Street
//   secondOpinion     — after the quiz's own rules (web answerCheck.js) said
//                       "Not quite", is the spoken answer right after all?
//
// What it costs. One of OpenAI's cheapest models, gpt-6-luna: $0.10 per
// million "tokens" read and $0.50 per million written (a token is a piece
// of a word, roughly ¾ of one). A second opinion is ~300 tokens, about
// 1/200 of a cent; ten Stretch cards are ~3,000, about 1/10 of a cent.
// The even cheaper gpt-5-nano was tried first (2026-11-08) and wasn't up to
// it: it copied the notes at every Stretch level, and as a second opinion
// it got 9 of 13 test answers right (luna 12), turning down right Spanish
// answers like "quiero un café con leche" for "Quisiera un café con leche".
// To keep it that way:
//   - the model "thinks" as little as it can (reasoning effort "minimal" or
//     "none": thinking is billed like writing);
//   - every request has a cap on how much it may write (max_output_tokens);
//   - each user has a daily limit of each kind (reserve() below), counted in
//     DynamoDB so it holds across every server copy Lambda runs;
//   - the app asks for a second opinion only after the free rules said no,
//     and remembers the answers it accepted (the card's `also`), so the same
//     answer is never asked about twice.
// Speech recognition never comes here: the iPhone hears answers itself
// (mobile SpeechAnswerPlugin.swift) and only the words it heard are sent.
//
// How the model is asked. OpenAI's "Responses" API takes `instructions`
// (the standing orders) and `input` (this request's material), and with a
// JSON Schema in `text.format` ("structured outputs") it must reply with
// JSON of exactly that shape, so the reply can be used without guessing.
//
// The key is OPENAI_API_KEY: api/.env on this computer, a Lambda
// environment variable on the server (infra/lib/wordbook-stack.ts). It never
// reaches the website or the iPhone app.
const database = require("./dynamoDb");

const OPENAI_URL = "https://api.openai.com/v1/responses";
// The cheapest model that does each job. OPENAI_STRETCH_MODEL and
// OPENAI_CHECK_MODEL can try others without a code change.
const MODELS = {
    stretch: () => process.env.OPENAI_STRETCH_MODEL || "gpt-6-luna",
    check: () => process.env.OPENAI_CHECK_MODEL || "gpt-6-luna",
};
// The least "thinking" a model allows: gpt-5 models call it "minimal",
// newer ones "none".
const leastEffort = (model) => (/^gpt-5/.test(model) ? "minimal" : "none");
// API Gateway gives up on a request after 30 seconds, so the model must
// answer well within that.
const TIMEOUT_MS = 25000;

// Daily limits per user (they reset at midnight UTC). A Stretch "batch" is
// one request of up to 10 cards: 20 questions are two.
const STRETCH_BATCHES_PER_DAY = 40;
const CHECKS_PER_DAY = 300;

// What one request may carry.
const MAX_CARDS = 10;
const MAX_NOTES = 80;
const MAX_MATERIAL = 14000; // characters of notes, ~3,500 tokens
const MAX_AVOID = 120;

// The counters live in the saved-quizzes table under a user name no real
// user can have ("#openai#alice"), like api/inbox.js's share counters, so
// they never show up among anyone's quizzes.
const COUNTER_TABLE = "dictionary_quizzes";

/** A refusal with a status code and a message for the user. */
class StretchError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Count `n` uses of a kind against the user's daily limit, or refuse.
 *
 * One row per user, kind and day, e.g. { user_name: "#openai#alice",
 * quiz_id: "check#2026-11-08", uses: 12 }. The update is atomic: DynamoDB
 * checks the condition and adds in one step, so two requests at the same
 * moment can't both slip past the limit.
 *
 * @param {string} userName
 * @param {'stretch'|'check'} kind
 * @param {number} limit uses allowed per day
 * @throws {StretchError} 429 when today's limit is used up
 */
async function reserve(userName, kind, limit) {
    const today = new Date().toISOString().slice(0, 10);
    try {
        await database.dynamoDbClientInstance().update({
            TableName: COUNTER_TABLE,
            Key: { user_name: `#openai#${userName}`, quiz_id: `${kind}#${today}` },
            UpdateExpression: "ADD uses :one",
            ConditionExpression: "attribute_not_exists(uses) OR uses < :max",
            ExpressionAttributeValues: { ":one": 1, ":max": limit },
        }).promise();
    } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
            throw new StretchError(429, kind === "check"
                ? `That's today's ${limit} second opinions. The rules alone will check answers until tomorrow.`
                : "That's today's limit for Stretch quizzes. Try again tomorrow.");
        }
        throw err;
    }
}

/**
 * Ask the model, and get back JSON of the given shape.
 *
 * @param {object} args
 * @param {string} args.model which model (MODELS)
 * @param {string} args.instructions what the model is to do, always the same
 * @param {string} args.input this request's material
 * @param {string} args.name a name for the reply's shape
 * @param {object} args.schema the reply's JSON Schema (strict: every
 *        property listed in `required`, no others allowed)
 * @param {number} args.maxTokens the most the model may write
 * @returns {Promise<object>} the parsed reply
 * @throws {StretchError} when it isn't set up, out of credit, slow or broken
 */
async function askModel({ model, instructions, input, name, schema, maxTokens }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new StretchError(503, "This isn't set up on the server yet (no OpenAI key).");

    // fetch() has no timeout of its own; an AbortController cancels it.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let res;
    let data;
    try {
        res = await fetch(OPENAI_URL, {
            method: "POST",
            signal: abort.signal,
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                reasoning: { effort: leastEffort(model) },
                max_output_tokens: maxTokens,
                instructions,
                input,
                text: { format: { type: "json_schema", name, strict: true, schema } },
                store: false, // OpenAI needn't keep this conversation
            }),
        });
        data = await res.json();
    } catch (err) {
        if (err.name === "AbortError") throw new StretchError(504, "That took too long. Try again.");
        throw new StretchError(502, "Couldn't reach OpenAI. Try again.");
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok || data.error) {
        const code = data && data.error && data.error.code;
        console.log(`openai error ${res.status}: ${data && data.error && data.error.message}`);
        if (code === "insufficient_quota") throw new StretchError(503, "The OpenAI account is out of credit.");
        if (res.status === 429) throw new StretchError(503, "OpenAI is busy. Try again in a minute.");
        throw new StretchError(502, "OpenAI couldn't answer. Try again.");
    }
    // "incomplete": it hit max_output_tokens before finishing the JSON.
    if (data.status === "incomplete") throw new StretchError(502, "The answer came back cut short. Try again.");

    // The reply's text is in output[] → a "message" → content[] →
    // "output_text" (the SDKs' `output_text` is a shortcut the plain HTTP
    // reply doesn't always have).
    const text = data.output_text || (data.output || [])
        .flatMap((o) => (o && o.type === "message" && Array.isArray(o.content) ? o.content : []))
        .filter((c) => c && c.type === "output_text")
        .map((c) => c.text)
        .join("");
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new StretchError(502, "OpenAI's answer couldn't be read. Try again.");
    }
}

// ---- Stretch cards -------------------------------------------------------

// What each Stretch level asks for. {L} is the language ("Spanish").
const LEVELS = [
    // 0 · As written
    "Use only phrases that are in the notes, as written; you may take a phrase out of a longer line. "
    + "For a line that is only in {L}, you supply the English. Use no new words.",
    // 1 · Remix
    "Write NEW sentences that combine words and phrases from different lines of the notes; never copy a line "
    + "as it is. Use only words from the notes (other forms of the same verbs and nouns are fine, and so are "
    + "small words like articles, \"y\", \"de\", \"que\", \"no\"). Example: from \"Estoy cansado\" and "
    + "\"La cuenta, por favor\", write \"Estoy cansado. La cuenta, por favor.\"",
    // 2 · Conversation
    "Write short real-world moments (a café, a shop, a taxi, asking the way, meeting people) built on the notes; "
    + "never copy a line as it is: change it to fit the moment. About one word in ten may be new, but easy to "
    + "guess in context. Mix two kinds of card: what someone says "
    + "to the learner (to understand) and what the learner says back (to answer). The scene sets it up, e.g. "
    + "\"At a café. The waiter asks: ¿Para llevar o para aquí? You want it to go.\"",
    // 3 · Street
    "Write what the learner would really hear out in the world and need to understand or answer: natural, "
    + "casual, the way native speakers talk, with the replies and variations the notes don't have (e.g. for "
    + "\"¿Dónde está la estación?\": \"Está a dos cuadras, a mano derecha.\"). Never copy a line from the notes. "
    + "About one word in five may be new. Most cards have a scene, as in a conversation.",
];

const STRETCH_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
        cards: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["note", "scene", "foreign", "english", "english_also", "foreign_also"],
                properties: {
                    note: { type: "integer" },
                    scene: { type: "string" },
                    foreign: { type: "string" },
                    english: { type: "string" },
                    english_also: { type: "array", items: { type: "string" } },
                    foreign_also: { type: "array", items: { type: "string" } },
                },
            },
        },
    },
};

const str = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const strList = (list, max, each) => (Array.isArray(list) ? list.map((s) => str(s, each)).filter(Boolean).slice(0, max) : []);

/**
 * Write Stretch cards from a user's notes.
 *
 * @param {string} userName who's asking (for the daily limit)
 * @param {object} body from the app (web utils/stretch.js)
 * @param {Array<{title: string, lines: string[]}>} body.notes the notes, all their lines
 * @param {string} body.language "Spanish"
 * @param {number} body.level 0–3, the Stretch dial
 * @param {number} body.count cards wanted, 1–10
 * @param {string[]} [body.avoid] phrases already asked (for "10 more")
 * @returns {Promise<Array<{note, scene, foreign, english, englishAlso, foreignAlso}>>}
 *          `note` is the position in body.notes the card draws on, or -1
 */
async function makeStretchCards(userName, body = {}) {
    const level = Number.isInteger(body.level) && body.level >= 0 && body.level <= 3 ? body.level : 1;
    const count = Math.min(MAX_CARDS, Math.max(1, Number.parseInt(body.count, 10) || 10));
    const language = str(body.language, 40) || "Spanish";
    const notes = Array.isArray(body.notes) ? body.notes.slice(0, MAX_NOTES) : [];

    // The notes as numbered blocks, cut off at MAX_MATERIAL characters.
    let material = "";
    notes.forEach((n, i) => {
        const block = `[${i}] ${str(n && n.title, 120)}\n${strList(n && n.lines, 400, 400).join("\n")}\n\n`;
        if (material.length + block.length <= MAX_MATERIAL) material += block;
    });
    if (!material.trim()) throw new StretchError(400, "No notes to make cards from.");
    const avoid = strList(body.avoid, MAX_AVOID, 200);

    await reserve(userName, "stretch", STRETCH_BATCHES_PER_DAY);

    const L = (s) => s.replace(/\{L\}/g, language);
    const instructions = L(
        "You write flash cards for an adult learning {L}, from the learner's own notes. "
        + "Each card is a {L} phrase or sentence (\"foreign\") and its natural English meaning (\"english\"). "
        + "Keep each side short: at most about 12 words. Write correct, natural {L} with accents and ¿ ¡ where needed. "
        + "The notes can hold lines only in {L} (examples, dialogue): they are part of what the learner knows; use them too. "
        + `This quiz's level: ${LEVELS[level]} `
        + "\"scene\": one short English line that sets up the situation, or \"\" when there's none (always \"\" at the first level). "
        + "It must not give the answer away. "
        + "\"english_also\" and \"foreign_also\": up to 3 other ways to say that side that are just as right (or none). "
        + "\"note\": the number in brackets of the note the card draws on most, or -1. "
        + "Make every card different, cover different notes where you can, and don't repeat a phrase from the \"Already asked\" list.",
    );
    const input = `Write ${count} cards.\n\nNotes:\n${material}`
        + (avoid.length ? `Already asked:\n${avoid.join("\n")}\n` : "");

    const reply = await askModel({
        model: MODELS.stretch(), instructions, input, name: "stretch_cards", schema: STRETCH_SCHEMA, maxTokens: 400 + count * 160,
    });
    return (Array.isArray(reply.cards) ? reply.cards : [])
        .map((c) => ({
            note: Number.isInteger(c.note) && c.note >= 0 && c.note < notes.length ? c.note : -1,
            scene: str(c.scene, 300),
            foreign: str(c.foreign, 300),
            english: str(c.english, 300),
            englishAlso: strList(c.english_also, 3, 200),
            foreignAlso: strList(c.foreign_also, 3, 200),
        }))
        .filter((c) => c.foreign && c.english)
        .slice(0, count);
}

// ---- Second opinion ------------------------------------------------------

const OPINION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["correct", "why"],
    properties: {
        correct: { type: "boolean" },
        why: { type: "string" },
    },
};

const OPINION_INSTRUCTIONS =
    "You check a language learner's spoken answer to a flash card, like a fair, friendly teacher. "
    + "The answer was written down by speech recognition, so ignore capitals, punctuation and accents, "
    + "and allow a word that sounds the same as the right one. "
    + "Judge the meaning, not the exact words. When the answer is in English, the learner was showing they "
    + "understood: accept any wording that means the same here, however casual (\"check\" for \"bill\", "
    + "\"get\" for \"bring\", \"Can you\" for \"Could you\", no \"please\", a synonym like \"exhausted\" for "
    + "\"tired\"). When the answer is in another language, accept any correct, natural way to say the same thing, "
    + "including a correct answer the card doesn't list. "
    + "Reject an answer that means something else, changes who or when in a way that changes the meaning, "
    + "leaves out a key part, has a grammar mistake in the other language, or is in the wrong language. "
    + "\"why\": at most 12 words, in English, speaking to the learner as \"you\" "
    + "(e.g. \"'Exhausted' means 'tired' here.\" or \"You asked for directions, not the bill.\").";

/**
 * Is a spoken answer right, though the quiz's rules said no?
 *
 * @param {string} userName who's asking (for the daily limit)
 * @param {object} body from the app (NotebookQuiz.js)
 * @param {string} body.asked the card's front, the question
 * @param {string} body.answer the card's answer side
 * @param {string[]} [body.also] other answers already accepted
 * @param {string} body.language the answer's language ("English", "Spanish")
 * @param {string} [body.scene] the card's scene, if it has one
 * @param {string} body.heard what speech recognition heard
 * @returns {Promise<{correct: boolean, why: string}>}
 */
async function secondOpinion(userName, body = {}) {
    const heard = str(body.heard, 300);
    const answer = str(body.answer, 300);
    if (!heard || !answer) throw new StretchError(400, "Nothing to check.");

    await reserve(userName, "check", CHECKS_PER_DAY);

    const input = JSON.stringify({
        scene: str(body.scene, 300) || undefined,
        question: str(body.asked, 300),
        answer_language: str(body.language, 40) || "English",
        card_answer: answer,
        also_accepted: strList(body.also, 10, 200),
        learner_said: heard,
    });
    const reply = await askModel({
        model: MODELS.check(), instructions: OPINION_INSTRUCTIONS, input, name: "second_opinion", schema: OPINION_SCHEMA, maxTokens: 150,
    });
    return { correct: reply.correct === true, why: str(reply.why, 200) };
}

module.exports = { makeStretchCards, secondOpinion, StretchError };
