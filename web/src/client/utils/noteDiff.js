import { diffWordsWithSpace, diffLines } from 'diff';

// What changed between two versions of a note, for the History window
// (NoteHistory.js): "added since then" and "not in the note now".
//
// Notes are HTML, but a comparison of HTML would show tags and attributes.
// Instead each version becomes its text, one line per paragraph (or list
// line, heading, table row…), and the two texts are compared word by word
// with the `diff` library. Its diffWordsWithSpace answers with the text cut
// into parts, each marked `added` (only in the newer text), `removed` (only
// in the older one) or neither (in both); showing them in order, with the
// added and removed parts marked, gives the changes in place.

// What counts as one line: the innermost of these (as in utils/notePlace.js).
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, [data-type="block-math"]';

/**
 * A note's text, one line per paragraph.
 * @param {string} html
 */
export function noteText(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const blocks = [...doc.body.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS));
    if (blocks.length === 0) return (doc.body.textContent || '').trim();
    return blocks.map((el) => (el.textContent || '').replace(/[ \t\r\n]+/g, ' ').trim()).join('\n');
}

/**
 * The changes from an older version's text to a newer one's.
 * Very long notes are compared line by line instead (word by word would be
 * slow there).
 * @param {string} older
 * @param {string} newer
 * @returns {Array<{value: string, added?: boolean, removed?: boolean}>}
 */
export function textChanges(older, newer) {
    if (older.length + newer.length > 300000) return diffLines(older, newer);
    return diffWordsWithSpace(older, newer);
}
