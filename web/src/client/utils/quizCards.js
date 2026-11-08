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
// The English is cut to as many sentences as the phrase has, so a note
// that explains after the translation ("Dónde — Where. It asks about a
// location.") asks for "Where." only.
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

// The sentences in some text: a split after . ! ? or … where the next
// sentence starts with a capital ("Where. It asks about a location." is two).
const sentencesIn = (s) => s.split(/(?<=[.!?…])\s+(?=[¿¡"“‘(]?\p{Lu})/u).filter(hasLetters);

/**
 * The English as long as the phrase: as many sentences as the foreign side
 * has, so an explanation after the translation isn't part of the answer.
 *
 *   Dónde — Where. It asks about a location.        ->  "Where."
 *   En metro. Sigue recto. — By subway. Go straight. ->  both sentences
 *
 * @param {string} english the cleaned English
 * @param {string} foreign the cleaned foreign phrase
 * @returns {string} the English, or its first sentences
 */
function englishAsLongAs(english, foreign) {
    const keep = Math.max(1, sentencesIn(foreign).length);
    const sentences = sentencesIn(english);
    return sentences.length > keep ? sentences.slice(0, keep).join(' ') : english;
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
        const whole = clean(rest.map((s) => s.text).join(' '));
        const front = clean(foreign[0].text);
        if (!hasLetters(whole) || !front) return;
        if (!readsAsTranslation(line, line.indexOf(foreign[0]))) return;
        const english = englishAsLongAs(whole, front);
        // Its audio: the line's English as marked, or (when trimmed) just
        // the part kept, read the way the English is marked.
        const englishReading = (rest.find((s) => hasLetters(s.text)) || {}).reading || null;
        const englishChunks = english === whole
            ? rest.flatMap(chunksOfStretch)
            : chunksOfStretch({ text: english, reading: englishReading });
        cards.push({
            foreign: { text: front, lang: foreign[0].reading.lang, chunks: chunksOfStretch(foreign[0]) },
            english: { text: english, lang: 'en-US', chunks: englishChunks },
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

// A single word: the foreign side with no space in it ("Metro", "¿Dónde?").
const isOneWord = (card) => !/\s/.test(card.foreign.text.trim());

/**
 * A quiz on one note (the Quiz button on a note, with the notes it links
 * to): each question once, and the sentences and phrases before the single
 * words, so "¿Dónde está la estación?" comes before "Metro — Subway".
 * Otherwise the notes' order is kept. (The quiz also asks them all in one
 * go, without rounds: NotebookQuiz's `oneGo`.)
 *
 * @param {Array} cards from quizCardsOf, in the notes' order
 * @returns {Array} the cards to ask
 */
export function oneNoteCards(cards) {
    // The same question, even with a different capital or full stop:
    // "La estación más cercana" and "La estación más cercana." are one.
    const plain = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const seen = new Set();
    const once = cards.filter((c) => {
        const key = plain(c.foreign.text) + '\u0001' + plain(c.english.text);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return [...once.filter((c) => !isOneWord(c)), ...once.filter(isOneWord)];
}
