// "Audio pauses" on a note's toolbar (admins, AudioPausesButton): change a
// note's read-aloud pauses (<span class="tts-pause" data-seconds="2">, see
// editor/ttsPause.js) all at once, working on the note's saved HTML:
//
//   setAllPauses        every pause gets one length
//   addSpanishPauses    a pause at the end of each line with Spanish in it
//                       that's followed by another line with Spanish — time
//                       to repeat before the next phrase:
//                         • Yo tengo — I have ⏸
//                         • Tú tienes — You have ⏸
//                         • Usted tiene — You have, formal   (next: English)
//   removeSpanishPauses the pauses between such lines (at a line's end, or
//                       on a line of their own between them)
//   removeAllPauses     every pause
//
// "Line" = a paragraph, heading or list item's text; blank lines between
// don't count. "Spanish" = text marked to be read in Spanish (Markup
// Spanish or the editor's 🗣), Spain or Latin America.
import { DEFAULT_PAUSE, validPause } from './tts';

const parse = (html) => new DOMParser().parseFromString(html || '', 'text/html');
const PAUSE = 'span.tts-pause';

// The note's lines in order (TipTap puts a list item's text in a <p>).
const linesOf = (doc) => [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6')]
    .filter((el) => !el.closest('pre, code'));

const hasSpanish = (el) => [...el.querySelectorAll('.tts-lang[lang^="es-"]')].some((s) => s.textContent.trim());
const isBlank = (el) => !el.textContent.trim() && !el.querySelector(PAUSE);
const isPauseOnly = (el) => !el.textContent.trim() && !!el.querySelector(PAUSE);

// The pause chips at the very end of a line (ignoring trailing spaces).
function trailingPauses(el) {
    const out = [];
    for (let n = el.lastChild; n; n = n.previousSibling) {
        if (n.nodeType === 3 && !n.nodeValue.trim()) continue;
        if (n.nodeType === 1 && n.matches(PAUSE)) { out.push(n); continue; }
        if (n.nodeType === 1 && n.tagName === 'BR') continue;
        break;
    }
    return out;
}

// Pairs of Spanish lines that follow each other: { line, next, between }
// where `between` are the pause-only lines in between (blank lines skipped).
function spanishNeighbours(doc) {
    const lines = linesOf(doc);
    const pairs = [];
    lines.forEach((line, i) => {
        if (!hasSpanish(line)) return;
        const between = [];
        for (let j = i + 1; j < lines.length; j++) {
            if (isBlank(lines[j])) continue;
            if (isPauseOnly(lines[j])) { between.push(lines[j]); continue; }
            if (hasSpanish(lines[j])) pairs.push({ line, next: lines[j], between });
            return;
        }
    });
    return pairs;
}

// Remove a line element; a list item left with nothing in it goes too.
function removeLine(el) {
    const li = el.parentElement && el.parentElement.closest('li');
    el.remove();
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

/** A pause after each Spanish line followed by another; count = added. */
export function addSpanishPauses(html, seconds) {
    const doc = parse(html);
    const s = String(validPause(seconds) || DEFAULT_PAUSE);
    let count = 0;
    spanishNeighbours(doc).forEach(({ line, between }) => {
        if (between.length || trailingPauses(line).length) return; // already has one
        const pause = doc.createElement('span');
        pause.className = 'tts-pause';
        pause.setAttribute('data-seconds', s);
        const trailing = line.lastChild && line.lastChild.nodeType === 1 && line.lastChild.tagName === 'BR' ? line.lastChild : null;
        line.insertBefore(pause, trailing);
        count += 1;
    });
    return result(doc, count);
}

/** Remove the pauses between Spanish lines; count = removed. */
export function removeSpanishPauses(html) {
    const doc = parse(html);
    let count = 0;
    spanishNeighbours(doc).forEach(({ line, between }) => {
        trailingPauses(line).forEach((p) => { p.remove(); count += 1; });
        between.forEach((el) => { count += el.querySelectorAll(PAUSE).length; removeLine(el); });
    });
    return result(doc, count);
}

/** Remove every pause; lines left empty by it go too. count = removed. */
export function removeAllPauses(html) {
    const doc = parse(html);
    let count = 0;
    linesOf(doc).filter(isPauseOnly).forEach((el) => { count += el.querySelectorAll(PAUSE).length; removeLine(el); });
    doc.querySelectorAll(PAUSE).forEach((p) => { p.remove(); count += 1; });
    return result(doc, count);
}

export const countPauses = (html) => parse(html).querySelectorAll(PAUSE).length;
