// After opening a notebook search result: scroll to the first match in the
// open item and highlight it for a few seconds. Matching ignores capitals,
// accents and Hebrew vowel marks, like the search (api/notebook-search.js).
//
// The highlight uses the CSS Custom Highlight API where the browser has it
// (no change to the page's HTML); otherwise the match is selected, which
// browsers also show highlighted.
const HIGHLIGHT_MS = 4000;
let clearTimer = null;

// Text folded for matching, with map[i] = offset in the original string of
// folded character i.
function fold(text) {
    let folded = '';
    const map = [];
    let i = 0;
    for (const ch of text) {
        const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        for (const c of base) { folded += c; map.push(i); }
        i += ch.length;
    }
    return { folded, map };
}

/**
 * @param {Element} container where to look (e.g. the item's content)
 * @param {string} query what was searched for
 * @returns {boolean} true if a match was found and shown
 */
export function highlightFirstMatch(container, query) {
    const q = fold(String(query || '').trim().replace(/\s+/g, ' ')).folded;
    if (!container || q.length < 2) return false;

    // All text in reading order, remembering which node each character is in.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const pieces = []; // { node, start } (start = offset in `all`)
    let all = '';
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        pieces.push({ node: n, start: all.length });
        all += n.nodeValue;
    }
    const { folded, map } = fold(all);
    const at = folded.indexOf(q);
    if (at === -1) return false;
    const start = map[at];
    const end = at + q.length < map.length ? map[at + q.length] : all.length;

    const locate = (offset) => {
        let piece = pieces[0];
        for (const p of pieces) { if (p.start <= offset) piece = p; else break; }
        return [piece.node, Math.min(offset - piece.start, piece.node.nodeValue.length)];
    };
    const range = document.createRange();
    range.setStart(...locate(start));
    range.setEnd(...locate(end));

    const el = range.startContainer.parentElement;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    clearTimeout(clearTimer);
    if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function') {
        CSS.highlights.set('search-hit', new Highlight(range));
        clearTimer = setTimeout(() => CSS.highlights.delete('search-hit'), HIGHLIGHT_MS);
    } else {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        clearTimer = setTimeout(() => sel.removeAllRanges(), HIGHLIGHT_MS);
    }
    return true;
}
