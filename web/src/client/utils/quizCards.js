// The notebook quiz (admins, NotebookQuiz.js): flash cards made from the
// lines of notes that give a foreign phrase and its English, like
//
//   • Yo estoy — I am      ->  front "Yo estoy" (Spanish), back "I am"
//
// A line makes a card when exactly one stretch of it is marked with a
// foreign language (Markup Spanish, or the editor's 🗣) and the rest is
// English: not marked, or marked English, and with no Hebrew letters. So a
// line with two marked phrases ("Fue" - was, from "ser", …) or with no
// English is skipped.
//
// The two must also be joined the way a translation is, with the English
// all on one side of the phrase:
//   - by a separator (— – - : = →), the English after the phrase or before
//     it ("I am — Yo estoy"); or
//   - the phrase starting the line and the English straight after it
//     starting with a capital letter ("Yo me lavo. I wash myself.").
// That's what tells a translation from a sentence that only mentions a
// Spanish word: "Never pronounce the H in hacer" (English first, no
// separator) and "Ser is generally used for…" (goes on in lowercase) aren't
// cards. The separator isn't shown.
//
// Each side carries the chunks Play all reads for that part of the line
// (tts.js htmlToLines / chunksOfStretch), so it plays the same audio — and
// on the phone, the audio a download already saved, with no connection.
import { htmlToLines, chunksOfStretch, languageLabel } from './tts';

const HEBREW = /[֐-׿]/;
const isForeign = (reading) => !!(reading && reading.lang && !/^en-/i.test(reading.lang));
const hasLetters = (s) => /\p{L}/u.test(s);

// Bullets, dashes, colons, arrows and the like around a side's text.
const EDGES = /^[\s•·*\-–—:=→>,;]+|[\s•·*\-–—:=→>,;]+$/gu;
const clean = (s) => s.replace(/\s+/g, ' ').replace(EDGES, '');

// What joins a phrase and its English: a dash, colon, equals sign or arrow.
const SEPARATOR = /[—–\-:=→]/;
// The marks (no letters or digits) at the start or end of some text.
const leadingMarks = (s) => s.match(/^[^\p{L}\p{N}]*/u)[0];
const trailingMarks = (s) => s.match(/[^\p{L}\p{N}]*$/u)[0];

// Whether some text's first letter is a capital (I, Where, Él).
const startsWithCapital = (s) => /^\p{Lu}/u.test(s.slice(leadingMarks(s).length));

/**
 * Whether a line reads as a foreign phrase and its translation, with the
 * English on one side only, and either
 * - the marks between them (from the end of one and the start of the other)
 *   hold a dash, colon, equals sign or arrow, or
 * - the phrase starts the line and the English after it starts with a
 *   capital letter: "Yo me lavo. I wash myself."
 *
 * @param {Array<{text: string}>} line the line's stretches (htmlToLines)
 * @param {number} at where the foreign stretch is in the line
 * @returns {boolean}
 */
function readsAsTranslation(line, at) {
    const before = line.slice(0, at).map((s) => s.text).join('');
    const after = line.slice(at + 1).map((s) => s.text).join('');
    const phrase = line[at].text;
    if (hasLetters(before) && hasLetters(after)) return false; // English on both sides: a sentence
    const englishAfter = hasLetters(after);
    const between = englishAfter
        ? trailingMarks(phrase) + leadingMarks(after)
        : trailingMarks(before) + leadingMarks(phrase);
    if (SEPARATOR.test(between)) return true;
    return englishAfter && startsWithCapital(after); // the phrase starts the line (no letters before it)
}

/**
 * A note's quiz cards, in the note's order.
 *
 * @param {string} html the note's content
 * @returns {Array<{foreign: {text, lang, chunks}, english: {text, lang, chunks}}>}
 */
export function quizCardsOf(html) {
    const cards = [];
    htmlToLines(html).forEach((line) => {
        const foreign = line.filter((s) => isForeign(s.reading) && hasLetters(s.text));
        if (foreign.length !== 1) return;
        const rest = line.filter((s) => s !== foreign[0]);
        if (rest.some((s) => isForeign(s.reading) || HEBREW.test(s.text))) return;
        const english = clean(rest.map((s) => s.text).join(' '));
        const front = clean(foreign[0].text);
        if (!hasLetters(english) || !front) return;
        if (!readsAsTranslation(line, line.indexOf(foreign[0]))) return;
        cards.push({
            foreign: { text: front, lang: foreign[0].reading.lang, chunks: chunksOfStretch(foreign[0]) },
            english: { text: english, lang: 'en-US', chunks: rest.flatMap(chunksOfStretch) },
        });
    });
    return cards;
}

/**
 * What to call the cards' foreign language: "Spanish" when they're all in
 * one, else "Foreign".
 *
 * @param {Array} cards from quizCardsOf
 * @returns {string}
 */
export function quizLanguage(cards) {
    const labels = [...new Set(cards.map((c) => languageLabel(c.foreign.lang).replace(/ \(.*\)$/, '')))];
    return labels.length === 1 ? labels[0] : 'Foreign';
}
