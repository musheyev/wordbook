// Is a spoken quiz answer right? (NotebookQuiz.js, iPhone app.) The card's
// hidden side is the answer, e.g. "To take / Catch"; what speech recognition
// heard is compared with it the way a fair teacher would:
//
//   - Capitals, punctuation and accents don't matter: the recogniser may
//     write "adonde" for "Adónde", or add a "?".
//   - Either side of a slash or semicolon is enough: "to take" or "catch".
//   - Words in brackets are optional: "Que (part of tener que)" accepts
//     "que" and the whole thing.
//   - In English, a leading "to" is optional ("to go" or "go"), "a / an /
//     the" don't count, contractions are the same as the long form ("I'm" =
//     "I am"), and numbers may come as digits ("2" = "two"; Spanish too).
//   - Every word must be the right word. Speech recognition writes real
//     words, so one letter off is usually a different word ("necesita" for
//     "necesito", "donde" for "adónde", "make" for "take"), and is marked
//     wrong. Only a long English word (8+ letters) may be one letter off,
//     for spellings like "organise" / "organize".
//   - In a longer answer (4+ words) about one word in four may be missing,
//     extra or misheard, since the recogniser slips more in a sentence.

const EN_CONTRACTIONS = {
    "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
    "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is',
    "what's": 'what is', "where's": 'where is', "there's": 'there is', "who's": 'who is',
    "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
    "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot',
    "won't": 'will not', "i'll": 'i will', "you'll": 'you will', "i've": 'i have',
    "you've": 'you have', "we've": 'we have', "let's": 'let us', "haven't": 'have not',
};
const NUMBERS = {
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
        'nineteen', 'twenty'],
    es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
        'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho',
        'diecinueve', 'veinte'],
};
const EN_SKIP = new Set(['a', 'an', 'the']);

const isEnglish = (lang) => /^en/i.test(lang || 'en');

/**
 * The words of an answer, compared form: lower case, no accents or
 * punctuation, English contractions spelled out, small numbers as words.
 * @param {string} text
 * @param {string} lang
 * @returns {string[]}
 */
export function answerWords(text, lang) {
    const english = isEnglish(lang);
    let s = String(text || '').toLowerCase().replace(/[’‘`]/g, "'");
    if (english) {
        s = s.replace(/\b[a-z]+'[a-z]+\b/g, (w) => EN_CONTRACTIONS[w] || w).replace(/\bcan not\b/g, 'cannot');
    }
    s = s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const numbers = NUMBERS[(lang || '').slice(0, 2).toLowerCase()] || NUMBERS.en;
    return s.split(' ').filter(Boolean)
        .map((w) => (/^\d+$/.test(w) && numbers[Number(w)] ? numbers[Number(w)] : w))
        .filter((w) => !(english && EN_SKIP.has(w)));
}

/**
 * Every acceptable way to say the answer, as word lists.
 * @param {string} answer the card's hidden side
 * @param {string} lang
 * @returns {string[][]}
 */
function acceptedAnswers(answer, lang) {
    const parts = [answer, ...String(answer || '').split(/[/;]/)];
    const out = [];
    parts.forEach((part) => {
        [part.replace(/\([^)]*\)/g, ' '), part.replace(/[()]/g, ' ')].forEach((variant) => {
            const words = answerWords(variant, lang);
            if (!words.length) return;
            out.push(words);
            if (isEnglish(lang) && words[0] === 'to' && words.length > 1) out.push(words.slice(1));
        });
    });
    return out;
}

/** Letters apart (Levenshtein distance): insertions, deletions, changes. */
function distance(a, b, same = (x, y) => x === y) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        const row = [i];
        for (let j = 1; j <= b.length; j += 1) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (same(a[i - 1], b[j - 1]) ? 0 : 1));
        }
        prev = row;
    }
    return prev[b.length];
}

/** The same word (in English, a long one may be spelled one letter differently). */
function sameWord(heard, expected, english) {
    if (heard === expected) return true;
    return english && expected.length >= 8 && distance(heard, expected) <= 1;
}

/**
 * Whether what was heard answers the card.
 *
 * @param {string} heard what speech recognition wrote
 * @param {string} answer the card's hidden side, e.g. "To take / Catch"
 * @param {string} lang the answer's language, e.g. "en-US", "es-ES"
 * @returns {boolean}
 */
export function isRightAnswer(heard, answer, lang) {
    const said = answerWords(heard, lang);
    if (!said.length) return false;
    const english = isEnglish(lang);
    const same = (a, b) => sameWord(a, b, english);
    return acceptedAnswers(answer, lang).some((expected) => {
        const slips = expected.length <= 3 ? 0 : Math.floor(expected.length / 4);
        return distance(said, expected, same) <= slips;
    });
}
