// The notebook quiz (admins, NotebookQuiz.js): flash cards made from the
// lines of notes that give a foreign phrase and its English, like
//
//   • Yo estoy — I am      ->  front "Yo estoy" (Spanish), back "I am"
//
// A line makes a card when exactly one stretch of it is marked with a
// foreign language (Markup Spanish, or the editor's 🗣) and the rest is
// English: not marked, or marked English, and with no Hebrew letters. So a
// line with two marked phrases ("Fue" - was, from "ser", …) or with no
// English is skipped. The separator between the two (— - : = →) isn't
// shown.
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
