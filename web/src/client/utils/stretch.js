// Written quizzes (NotebookQuiz.js): the quiz sheet's first choice is what
// the questions are —
//
//   My cards        your own "Spanish — English" lines (quizCards.js); offline
//   Remix           new sentences from words you have           ┐ written by
//   Conversation    real-world moments; about 1 word in 10 new  │ OpenAI's
//   Street          what you'd really hear; about 1 word in 5   ┘ model
//
// (Inside, the written kinds are "Stretch" levels 1–3, api/stretch.js; its
// level 0, "As written", isn't offered: My cards does that, offline.)
//
// Unlike My cards, which only uses lines with both a foreign phrase and its
// English, the written kinds read every line of the notes, including the
// ones only in Spanish (examples, dialogue): they're part of what you know.
//
// This module does the app's side of it, with no network of its own:
//   - materialOf / materialFromCards: the notes as plain lines to send
//     (api/stretch.js writes the cards), the notes' language, and the
//     words they hold (to show which words on a card are new);
//   - pickMaterial: which notes go in one request (it's capped);
//   - cardsFromReply: the server's cards made into quiz cards, with their
//     audio (the same chunks Play all would read), and a note of whether
//     they're straight from your notes or written for this quiz;
//   - the sheet's remembered choices (kind, how many, second opinion).
import { htmlToLines, chunksOfStretch, languageLabel } from './tts';
import { roundsOf } from './quizRounds';

/**
 * The sheet's kinds of question, in order. `key` is the Stretch level sent to
 * the server (api/stretch.js); 0 is My cards, which asks nothing of it.
 */
export const QUIZ_KINDS = [
    { key: 0, name: 'My cards', hint: 'Your cards, as written. Works offline.' },
    { key: 1, name: 'Remix', hint: 'New sentences, only words you have.' },
    { key: 2, name: 'Conversation', hint: 'Real-world moments; about 1 word in 10 new.' },
    { key: 3, name: 'Street', hint: 'What you’d really hear; about 1 word in 5 new.' },
];

/** The most questions written at once (they take a while to write). */
export const MAX_WRITTEN = 50;

/** One request writes at most this many cards (api/stretch.js MAX_CARDS). */
export const PER_REQUEST = 10;

/** The second opinion's choices on the sheet (iPhone app; spoken answers). */
export const SECOND_OPINION = [
    { key: 'off', name: 'Off', hint: 'The rules alone decide.' },
    { key: 'ask', name: 'Ask me', hint: 'A button after “Not quite”.' },
    { key: 'auto', name: 'Automatic', hint: 'Every “Not quite” is checked.' },
];

// ---- Remembered choices (this device only) ----
// localStorage can be full or blocked (private browsing): then the
// defaults are used, and nothing breaks.
const read = (key, ok, fallback) => {
    try {
        const v = JSON.parse(localStorage.getItem(key));
        return ok(v) ? v : fallback;
    } catch (e) { return fallback; }
};
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* not kept */ } };

const isCount = (v, most) => Number.isInteger(v) && v >= 1 && v <= most;
export const lastKind = () => read('quiz-kind', (v) => QUIZ_KINDS.some((k) => k.key === v), 0);
export const rememberKind = (v) => write('quiz-kind', v);
/** How many questions to write (1–MAX_WRITTEN; 10 at first). */
export const lastCount = () => read('stretch-count', (v) => isCount(v, MAX_WRITTEN), 10);
export const rememberCount = (v) => write('stretch-count', v);
/** How many of My cards: 'all' (at first), or a number. */
export const lastCardCount = () => read('quiz-card-count', (v) => v === 'all' || isCount(v, Infinity), 'all');
export const rememberCardCount = (v) => write('quiz-card-count', v);
export const lastSecondOpinion = () => read('quiz-second-opinion', (v) => SECOND_OPINION.some((o) => o.key === v), 'ask');
export const rememberSecondOpinion = (v) => write('quiz-second-opinion', v);

// ---- The notes, as material ----

const isForeign = (reading) => !!(reading && reading.lang && !/^en-/i.test(reading.lang));
// A word as it's compared: lower case, without accents ("Está" = "esta"),
// so a recogniser's or the model's accents don't make a word look new.
const plainWord = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const wordsIn = (s) => (s.match(/[\p{L}\p{N}']+/gu) || []).map(plainWord);
// A line or phrase as compared: its words, one space apart.
const plainText = (s) => wordsIn(s).join(' ');

/**
 * The material for a Stretch quiz from notes.
 *
 * @param {Array<{source: {type, id, title}, html: string}>} notes in order
 * @returns {{notes: Array<{source, title, lines: string[]}>, lang: string|null,
 *            known: string[]}} `lang` is the foreign language most marked in
 *   them ("es-ES"; null for none); `known` every word in them, plain
 */
export function materialOf(notes) {
    const langs = {};
    const known = new Set();
    const out = [];
    notes.forEach(({ source, html }) => {
        const lines = [];
        htmlToLines(html).forEach((line) => {
            line.forEach((s) => {
                if (isForeign(s.reading)) langs[s.reading.lang] = (langs[s.reading.lang] || 0) + s.text.length;
            });
            const text = line.map((s) => s.text).join('').replace(/\s+/g, ' ').trim();
            if (!/\p{L}/u.test(text)) return;
            lines.push(text);
            wordsIn(text).forEach((w) => known.add(w));
        });
        if (lines.length) out.push({ source, title: source.title || '', lines });
    });
    const lang = Object.keys(langs).sort((a, b) => langs[b] - langs[a])[0] || null;
    return { notes: out, lang, known: [...known] };
}

/**
 * The material from a saved quiz's cards (My Quizzes › Stretch): each card
 * is a line "foreign — English", grouped by the note it came from.
 *
 * @param {Array} cards a saved quiz's cards
 */
export function materialFromCards(cards) {
    const byNote = new Map();
    const known = new Set();
    const langs = {};
    cards.forEach((c) => {
        const key = c.source ? `${c.source.type}:${c.source.id}` : '';
        if (!byNote.has(key)) byNote.set(key, { source: c.source || null, title: (c.source && c.source.title) || '', lines: [] });
        const line = `${c.foreign.text} — ${c.english.text}`;
        byNote.get(key).lines.push(line);
        wordsIn(line).forEach((w) => known.add(w));
        if (c.foreign.lang) langs[c.foreign.lang] = (langs[c.foreign.lang] || 0) + 1;
    });
    const lang = Object.keys(langs).sort((a, b) => langs[b] - langs[a])[0] || null;
    return { notes: [...byNote.values()], lang, known: [...known] };
}

// The most note text one request carries (api/stretch.js cuts at 14,000).
const SEND_AT_MOST = 13000;

/**
 * The notes for one request, in a random order and up to the cap, so a
 * big notebook gives each request (and each "10 more") a different part.
 *
 * @param {Array} notes material.notes
 * @returns {Array<{source, title, lines}>}
 */
export function pickMaterial(notes) {
    const shuffled = [...notes];
    for (let i = shuffled.length - 1; i > 0; i -= 1) { // Fisher–Yates shuffle
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked = [];
    let size = 0;
    for (const n of shuffled) {
        const len = n.title.length + n.lines.join('\n').length + 8;
        if (size + len > SEND_AT_MOST) {
            if (picked.length) continue; // try a smaller note
            // One huge note: send its first lines.
            const lines = [];
            n.lines.forEach((l) => { if (size + l.length + 1 <= SEND_AT_MOST) { lines.push(l); size += l.length + 1; } });
            picked.push({ ...n, lines });
            break;
        }
        picked.push(n);
        size += len;
    }
    return picked;
}

/** The language's name for the model ("Spanish"). */
export const languageName = (lang) => languageLabel(lang || 'es-ES').replace(/ \(.*\)$/, '');

/**
 * The server's cards (api/stretch.js) as quiz cards.
 *
 * Each side has the shape the quiz knows ({ text, lang, chunks, also }),
 * so everything else (flip, read aloud, spoken answers, Save) works as on
 * any card. Extra, for Stretch:
 *   scene    the situation, shown above the card ("At a café. …")
 *   stretch  { level, batch, own, newWords }: `batch` groups the cards one
 *            Start (or "10 more") made, which the quiz asks as a round;
 *            `own` is true when both sides are straight from the notes;
 *            `newWords` the foreign words that aren't in the notes.
 *
 * @param {Array} reply the server's cards
 * @param {Array} sent the notes that request sent (reply's `note` indexes them)
 * @param {{lang: string, known: string[]}} material
 * @param {number} level the Stretch level
 * @param {number} batch which Start / "10 more" made them
 */
export function cardsFromReply(reply, sent, material, level, batch) {
    const known = new Set(material.known);
    const lines = sent.flatMap((n) => n.lines.map(plainText));
    const inNotes = (s) => { const p = plainText(s); return !!p && lines.some((l) => l.includes(p)); };
    const side = (text, lang, also) => ({
        text,
        lang,
        chunks: chunksOfStretch({ text, reading: { lang } }),
        ...(also && also.length ? { also } : {}),
    });
    return reply.map((c) => {
        const note = c.note >= 0 && sent[c.note] ? sent[c.note] : null;
        // The card's new words, as written ("quisiera"), leaving out numbers
        // and little words like "lo", "el", "y" (they aren't news).
        const newWords = [...new Set((c.foreign.match(/[\p{L}\p{N}']+/gu) || [])
            .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !known.has(plainWord(w)))
            .map((w) => w.toLowerCase()))];
        return {
            foreign: side(c.foreign, material.lang, c.foreignAlso),
            english: side(c.english, 'en-US', c.englishAlso),
            ...(note && note.source ? { source: note.source } : {}),
            ...(c.scene ? { scene: c.scene } : {}),
            stretch: { level, batch, own: inNotes(c.foreign) && inNotes(c.english), newWords },
        };
    });
}

/**
 * The rounds of a written quiz, as [start, end) positions: each batch (a
 * Start or a "10 more") starts a new round, and a big batch (up to 50) is
 * cut into rounds of about 20, like the quiz on your cards (quizRounds.js
 * roundsOf).
 * @param {Array} cards
 */
export function stretchRounds(cards) {
    const batches = [];
    cards.forEach((c, i) => {
        const batch = c.stretch ? c.stretch.batch : 0;
        const last = batches[batches.length - 1];
        if (last && last.batch === batch) last.end = i + 1;
        else batches.push({ batch, start: i, end: i + 1 });
    });
    return batches.flatMap((b) => roundsOf(b.end - b.start).map(([s, e]) => [b.start + s, b.start + e]));
}
