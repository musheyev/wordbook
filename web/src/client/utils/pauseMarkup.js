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
//                        and, on a line whose words before its "—" are
//                        foreign, a pause before the "—" (time to say them
//                        before hearing the English) and one at its end
//                        (time to repeat the English) — any such line, a
//                        line on its own or the last one too:
//                          • Yo estoy ⏸ — I am ⏸
//                          • Cuántas paradas ⏸ — How many stops ⏸
//   addLinePauses        a pause at the end of every line that's followed
//                        by another, in any language — English too:
//                          Greetings ⏸
//                          • Hola — Hello ⏸
//                          • Adiós — Goodbye                 (the last line)
//   removeForeignPauses  the pauses addForeignPauses adds: between such
//                        lines (at a line's end, or on a line of their own
//                        between them), and those before a "—" after
//                        foreign words and at the end of such a line
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

/**
 * How much of a text node (by weight) is read aloud in a foreign language.
 * `text` is the part of the node to count (all of it unless given).
 */
const foreignWeight = (node, text = node.nodeValue) => {
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
//   parts     its text nodes and pause chips, in order (to find a spot
//             inside the line, like its "—")
function linesOf(doc) {
    const out = [];
    const newLine = (block) => ({ block, br: null, text: '', foreign: 0, pauses: [], trailing: [], parts: [] });
    [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6')]
        .filter((el) => !el.closest('pre, code'))
        .forEach((block) => {
            let line = newLine(block);
            const walker = doc.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n.nodeType === Node.TEXT_NODE) {
                    line.text += n.nodeValue;
                    line.foreign += foreignWeight(n);
                    line.parts.push(n);
                    if (n.nodeValue.trim()) line.trailing = [];
                } else if (n.tagName === 'BR') {
                    line.br = n;
                    out.push(line);
                    line = newLine(block);
                } else if (n.matches(PAUSE)) {
                    line.pauses.push(n);
                    line.trailing.push(n);
                    line.parts.push(n);
                }
            }
            out.push(line);
        });
    return out;
}

const isBlank = (line) => !line.text.trim() && !line.pauses.length;
const isPauseOnly = (line) => !line.text.trim() && line.pauses.length > 0;
const isForeign = (foreign, text) => foreign > 0 && foreign >= FOREIGN_SHARE * weight(text);
const isForeignLine = (line) => isForeign(line.foreign, line.text);

const DASH = '—';

/**
 * A line's first "—", when the words in front of it are foreign (the same
 * one-third rule as a whole line, counted on just those words) and some
 * words follow it:
 *
 *   Cuántas paradas — How many stops     → { node, at, pauses: [] }
 *   Cuántas paradas ⏸ — How many stops   → pauses: [that chip]
 *   Greetings — Saludos                  → null (English in front)
 *
 * node/at: the text node holding the dash, and where in it a pause would go
 * — just before the spaces in front of the dash ("paradas⏸ — How"); 0 when
 * only spaces come before the dash in that node.
 * pauses: the chips already between those words and the dash.
 */
function dashAfterForeign(line) {
    let text = '';
    let foreign = 0;
    let pauses = [];
    for (const part of line.parts) {
        if (part.nodeType !== Node.TEXT_NODE) { pauses.push(part); continue; }
        const value = part.nodeValue;
        const i = value.indexOf(DASH);
        const head = i < 0 ? value : value.slice(0, i);
        text += head;
        foreign += foreignWeight(part, head);
        if (head.trim()) pauses = [];
        if (i < 0) continue;
        const after = line.text.slice(line.text.indexOf(DASH) + 1);
        if (!letters(after) || !isForeign(foreign, text)) return null;
        return { node: part, at: head.replace(/\s+$/, '').length, pauses };
    }
    return null;
}

// Put a pause chip of `s` seconds at a dash spot found by dashAfterForeign:
// split the text node there (unless the spot is its start) and slip the chip
// in between.
function insertPauseAt(doc, { node, at }, s) {
    const pause = doc.createElement('span');
    pause.className = 'tts-pause';
    pause.setAttribute('data-seconds', s);
    const rest = at > 0 ? node.splitText(at) : node;
    rest.parentNode.insertBefore(pause, rest);
}

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

// Put a pause chip of `s` seconds at the very end of a line: just before the
// <br> that ends it, or as the last thing in its paragraph.
function appendPause(doc, line, s) {
    const pause = doc.createElement('span');
    pause.className = 'tts-pause';
    pause.setAttribute('data-seconds', s);
    if (line.br) line.br.parentNode.insertBefore(pause, line.br);
    else line.block.appendChild(pause);
}

// Whether the next line that isn't blank is just a pause (one on a line of
// its own right after lines[i]) — that already counts as a pause at its end.
function pauseLineAfter(lines, i) {
    for (let j = i + 1; j < lines.length; j++) {
        if (isBlank(lines[j])) continue;
        return isPauseOnly(lines[j]);
    }
    return false;
}

/**
 * The pauses for saying foreign phrases back; count = added:
 *   - at the end of each foreign-language line followed by another;
 *   - on a line with foreign words before its "—" (dashAfterForeign): one
 *     before the "—" and one at the line's end, wherever the line is.
 * Spots that already have a pause are left as they are, and no line gets
 * two at its end.
 */
export function addForeignPauses(html, seconds) {
    const doc = parse(html);
    const s = String(validPause(seconds) || DEFAULT_PAUSE);
    const lines = linesOf(doc);
    let count = 0;
    const ended = new Set(); // lines given a pause at their end here
    const endWithPause = (line) => {
        if (ended.has(line)) return;
        ended.add(line);
        appendPause(doc, line, s);
        count += 1;
    };
    foreignNeighbours(lines).forEach(({ line, between }) => {
        if (between.length || line.trailing.length) return; // already has one
        endWithPause(line);
    });
    lines.forEach((line, i) => {
        const dash = dashAfterForeign(line);
        if (!dash) return;
        if (!dash.pauses.length) {
            insertPauseAt(doc, dash, s);
            count += 1;
        }
        if (!line.trailing.length && !pauseLineAfter(lines, i)) endWithPause(line);
    });
    return result(doc, count);
}

/**
 * A pause at the end of every line followed by another (any language);
 * count = added. Skipped: lines that already end in a pause or have one on a
 * line of its own right after them, and the note's last line (nothing
 * follows it, so there's nothing to wait for).
 */
export function addLinePauses(html, seconds) {
    const doc = parse(html);
    const s = String(validPause(seconds) || DEFAULT_PAUSE);
    const lines = linesOf(doc).filter((line) => !isBlank(line));
    let count = 0;
    lines.forEach((line, i) => {
        const next = lines[i + 1];
        if (!next || isPauseOnly(line) || isPauseOnly(next) || line.trailing.length) return;
        appendPause(doc, line, s);
        count += 1;
    });
    return result(doc, count);
}

/**
 * Remove the pauses addForeignPauses adds: between foreign-language lines,
 * and before the "—" and at the end of a line with foreign words before its
 * "—"; count = removed.
 */
export function removeForeignPauses(html) {
    const doc = parse(html);
    const lines = linesOf(doc);
    let count = 0;
    const drop = (p) => { if (p.isConnected) { p.remove(); count += 1; } };
    lines.forEach((line) => {
        const dash = dashAfterForeign(line);
        if (dash) [...dash.pauses, ...line.trailing].forEach(drop);
    });
    foreignNeighbours(lines).forEach(({ line, between }) => {
        line.trailing.forEach(drop);
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
