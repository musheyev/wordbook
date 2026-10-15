// "▶ Play" for text selected in a note (SelectionPlayButton): the selection
// is widened to whole sentences — from the start of the sentence it begins
// in to the end of the sentence it ends in — and read like the note itself
// (htmlToChunks). Whole sentences are the same pieces read-aloud already
// made audio for when the note was played, so that audio is reused (the
// server keeps it by text + language + voice); part of a sentence would be
// new text needing new audio.
import { htmlToChunks } from './tts';

// Where sentences end, as read-aloud splits them (utils/tts.js sentencesOf):
// . ! ? ׃ … (with closing quotes/brackets) before a space, or a line break.
const SENTENCE_END = /[.!?׃…]+["'”’)\]]*(?=\s)|\n/g;
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, div';

// A block's text with a way back to the DOM: pos(i) = [node, offset] of
// character i. A line break (<br>) is a "\n".
function blockText(block) {
    let text = '';
    const at = []; // [node, offset] per character
    const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
            for (let i = 0; i < n.nodeValue.length; i++) at.push([n, i]);
            text += n.nodeValue;
        } else if (n.tagName === 'BR') {
            const parent = n.parentNode;
            at.push([parent, Array.prototype.indexOf.call(parent.childNodes, n)]);
            text += '\n';
        }
    }
    const pos = (i) => (i < at.length ? at[i] : [block, block.childNodes.length]);
    // Index in `text` of a DOM position inside the block.
    const indexOf = (node, offset) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const i = at.findIndex(([n, o]) => n === node && o === offset);
            if (i !== -1) return i;
            const last = at.findIndex(([n]) => n === node);
            return last === -1 ? 0 : last + Math.min(offset, node.nodeValue.length);
        }
        const r = block.ownerDocument.createRange();
        r.setStart(node, offset);
        const i = at.findIndex(([n, o]) => {
            const p = block.ownerDocument.createRange();
            p.setStart(n, o);
            return r.compareBoundaryPoints(Range.START_TO_START, p) <= 0;
        });
        return i === -1 ? text.length : i;
    };
    return { text, pos, indexOf };
}

const blockOf = (node, root) => {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const b = el && el.closest(BLOCKS);
    return b && root.contains(b) ? b : root;
};

/**
 * The read-aloud chunks for what's selected inside `root`, widened to whole
 * sentences; [] if nothing (readable) is selected there.
 * @param {Selection} selection
 * @param {Element} root the note's text
 */
export function selectionChunks(selection, root) {
    if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return [];

    // Start: just after the last sentence end before the selection's start.
    const startBlock = blockOf(range.startContainer, root);
    const sb = blockText(startBlock);
    let s = sb.indexOf(range.startContainer, range.startOffset);
    while (s < sb.text.length && /\s/.test(sb.text[s])) s += 1; // spaces at the edge don't count
    let from = 0;
    SENTENCE_END.lastIndex = 0;
    for (let m = SENTENCE_END.exec(sb.text); m; m = SENTENCE_END.exec(sb.text)) {
        const stop = m.index + m[0].length;
        if (stop <= s) from = stop; else break;
    }
    while (from < sb.text.length && /\s/.test(sb.text[from])) from += 1;

    // End: the end of the sentence the selection ends in (with its full stop).
    const endBlock = blockOf(range.endContainer, root);
    const eb = blockText(endBlock);
    let e = eb.indexOf(range.endContainer, range.endOffset);
    while (e > 0 && /\s/.test(eb.text[e - 1])) e -= 1;
    let to = eb.text.length;
    SENTENCE_END.lastIndex = 0;
    for (let m = SENTENCE_END.exec(eb.text); m; m = SENTENCE_END.exec(eb.text)) {
        // Where this sentence ends: after its punctuation, or at the line break.
        const stop = m[0] === '\n' ? m.index : m.index + m[0].length;
        if (stop >= e) { to = stop; break; }
    }

    const wide = root.ownerDocument.createRange();
    wide.setStart(...sb.pos(from));
    wide.setEnd(...eb.pos(to));
    const box = root.ownerDocument.createElement('div');
    box.appendChild(wide.cloneContents());
    return htmlToChunks(box.innerHTML);
}
