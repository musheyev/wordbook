// "Audio pauses" on a note's toolbar (admins, AudioPausesButton): change a
// note's read-aloud pauses (<span class="tts-pause" data-seconds="2">, see
// editor/ttsPause.js) all at once, working on the note's saved HTML:
//
//   setAllPauses         every pause gets one length
//   addForeignPauses     a pause at the end of each foreign-language line
//                        that's followed by another one — time to repeat
//                        before the next phrase:
//                          • Yo estoy — I am ⏸
//                          • Tú estás — You are ⏸
//                          • Ustedes están — You all are     (next: English)
//   removeForeignPauses  the pauses between such lines (at a line's end, or
//                        on a line of their own between them)
//   removeAllPauses      every pause
//
// A "line" is a paragraph, heading or list item — or each part of one split
// with line breaks (Shift+Enter, or pasted text). Blank lines between don't
// count.
//
// English is the home language; every other language is foreign. A
// "foreign-language line" is one that's largely foreign: at least a third of
// its letters are read aloud in another language than English. Which
// language a letter is read in follows read-aloud's own rules (utils/tts.js):
//   - marked with a language (Markup Spanish, or the editor's 🗣): that
//     language — Spanish, French, Italian, German…, or English if marked so;
//   - not marked: Hebrew letters are read in Hebrew, the rest in English.
// So "• Yo estoy — I am" (Spanish marked) and "• שלום — hello" are foreign
// lines, but an English sentence that mentions "estar" isn't. Lines in two
// foreign languages count too.
//
// Hebrew letters count double: Hebrew is written without most vowels, so
// its words have about half the letters. Counted once, "תודה — thank you"
// (4 Hebrew letters of 12) would fall just short; counted double it's 8 of
// 16. "ג (Gimel)" (2 of 7) still doesn't count: it's mostly the English name.
import { DEFAULT_PAUSE, validPause } from './tts';

const parse = (html) => new DOMParser().parseFromString(html || '', 'text/html');
const PAUSE = 'span.tts-pause';
const FOREIGN_SHARE = 0.34;
const letters = (s) => (s.match(/\p{L}/gu) || []).length;
// Hebrew letters (and their presentation forms), as read-aloud finds them.
const HEBREW_LETTERS = /[\u05D0-\u05EA\u05F0-\u05F2\uFB1D-\uFB4F]/g;
const hebrewLetters = (s) => (s.match(HEBREW_LETTERS) || []).length;

/** A text's letters, with each Hebrew letter counted twice (see above). */
const weight = (s) => letters(s) + hebrewLetters(s);

/** How much of a text node (by weight) is read aloud in a foreign language. */
const foreignWeight = (node) => {
    const text = node.nodeValue;
    const marked = node.parentElement && node.parentElement.closest('.tts-lang[lang]');
    const lang = marked ? marked.getAttribute('lang') || '' : '';
    if (lang) return /^en-/i.test(lang) ? 0 : weight(text);
    return 2 * hebrewLetters(text);
};

// The note's lines, in order: { block, br, text, foreign, pauses, trailing }
//   block     the paragraph/heading the line is in
//   br        the <br> that ends it (null: the end of the block)
//   text      its text; foreign = how much of it (by weight) is read in a
//             foreign language
//   pauses    pause chips in it; trailing = those at its very end
function linesOf(doc) {
    const out = [];
    [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6')]
        .filter((el) => !el.closest('pre, code'))
        .forEach((block) => {
            let line = { block, br: null, text: '', foreign: 0, pauses: [], trailing: [] };
            const walker = doc.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n.nodeType === Node.TEXT_NODE) {
                    line.text += n.nodeValue;
                    line.foreign += foreignWeight(n);
                    if (n.nodeValue.trim()) line.trailing = [];
                } else if (n.tagName === 'BR') {
                    line.br = n;
                    out.push(line);
                    line = { block, br: null, text: '', foreign: 0, pauses: [], trailing: [] };
                } else if (n.matches(PAUSE)) {
                    line.pauses.push(n);
                    line.trailing.push(n);
                }
            }
            out.push(line);
        });
    return out;
}

const isBlank = (line) => !line.text.trim() && !line.pauses.length;
const isPauseOnly = (line) => !line.text.trim() && line.pauses.length > 0;
const isForeignLine = (line) => line.foreign > 0 && line.foreign >= FOREIGN_SHARE * weight(line.text);

// Pairs of foreign-language lines that follow each other: { line, next, between }
// where `between` are the pause-only lines in between (blank lines skipped).
function foreignNeighbours(lines) {
    const pairs = [];
    lines.forEach((line, i) => {
        if (!isForeignLine(line)) return;
        const between = [];
        for (let j = i + 1; j < lines.length; j++) {
            if (isBlank(lines[j])) continue;
            if (isPauseOnly(lines[j])) { between.push(lines[j]); continue; }
            if (isForeignLine(lines[j])) pairs.push({ line, next: lines[j], between });
            return;
        }
    });
    return pairs;
}

// Take a pause-only line out: its chips, and the line itself (its <br>, or
// the paragraph — and a list item left empty by that).
function removeLine(line) {
    line.pauses.forEach((p) => p.remove());
    if (line.br) { line.br.remove(); return; }
    const { block } = line;
    if (block.textContent.trim() || block.querySelector(PAUSE)) return; // other lines remain
    const li = block.parentElement && block.parentElement.closest('li');
    block.remove();
    if (li && !li.textContent.trim() && !li.querySelector('p, ul, ol')) li.remove();
}

const result = (doc, count) => ({ html: doc.body.innerHTML, count });

/** Every pause in the note gets `seconds`. count = pauses changed. */
export function setAllPauses(html, seconds) {
    const doc = parse(html);
    const s = validPause(seconds) || DEFAULT_PAUSE;
    let count = 0;
    doc.querySelectorAll(PAUSE).forEach((p) => {
        if (Number(p.getAttribute('data-seconds')) !== s) count += 1;
        p.setAttribute('data-seconds', String(s));
    });
    return result(doc, count);
}

/** A pause after each foreign-language line followed by another; count = added. */
export function addForeignPauses(html, seconds) {
    const doc = parse(html);
    const s = String(validPause(seconds) || DEFAULT_PAUSE);
    let count = 0;
    foreignNeighbours(linesOf(doc)).forEach(({ line, between }) => {
        if (between.length || line.trailing.length) return; // already has one
        const pause = doc.createElement('span');
        pause.className = 'tts-pause';
        pause.setAttribute('data-seconds', s);
        if (line.br) line.br.parentNode.insertBefore(pause, line.br);
        else line.block.appendChild(pause);
        count += 1;
    });
    return result(doc, count);
}

/** Remove the pauses between foreign-language lines; count = removed. */
export function removeForeignPauses(html) {
    const doc = parse(html);
    let count = 0;
    foreignNeighbours(linesOf(doc)).forEach(({ line, between }) => {
        line.trailing.forEach((p) => { p.remove(); count += 1; });
        between.forEach((l) => { count += l.pauses.length; removeLine(l); });
    });
    return result(doc, count);
}

/** Remove every pause; lines left empty by it go too. count = removed. */
export function removeAllPauses(html) {
    const doc = parse(html);
    let count = 0;
    linesOf(doc).filter(isPauseOnly).forEach((l) => { count += l.pauses.length; removeLine(l); });
    doc.querySelectorAll(PAUSE).forEach((p) => { p.remove(); count += 1; });
    return result(doc, count);
}

export const countPauses = (html) => parse(html).querySelectorAll(PAUSE).length;
