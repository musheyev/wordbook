// Keeping your place in a note when it switches between reading and editing.
//
// The note's reading view (SearchResult, NoteWindow) and its editor
// (CardEditorInline) are separate screens, each scrolling its own text, so
// switching used to start the new one at the top. Instead, right before the
// switch the screen being left notes which paragraph is at the top of its
// visible text (keepPlace), and the screen that opens scrolls that same
// paragraph to the same spot (useRestoredPlace), so the same sentences
// show.
//
// Both screens draw the note from the same HTML, so their paragraphs (and
// list lines, headings, table rows, images, formulas) come in the same
// order: "the 7th one" means the same paragraph in both. An edit can add or
// remove paragraphs above it, though, so the paragraph is found by its text
// first, and by its number only when no paragraph has that text any more.
//
// Nothing is saved: the place is kept in memory for the moment of the
// switch (it's dropped after a minute, e.g. if a save fails and you leave).

import { useEffect } from 'react';

// What counts as one "paragraph". Only the innermost ones are used (a list
// line holds a <p>; the <p> is the one counted), the same on both screens.
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, img, [data-type="block-math"]';
const KEEP_FOR_MS = 60 * 1000;

/** A note's paragraphs, in order. @param {Element} root the note's text */
function blocksIn(root) {
    return [...root.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS));
}

const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);

/**
 * The box that scrolls the note's text: the nearest one around it that
 * scrolls, else the page.
 * @param {Element} el
 */
function scrollerOf(el) {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return document.scrollingElement || document.documentElement;
}

/** Where the scrolling box's visible area starts, on screen. */
const viewTop = (scroller) => (scroller === (document.scrollingElement || document.documentElement)
    ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop);

/**
 * The paragraph at the top of what shows, or null when the text isn't
 * scrolled (the new screen starts at the top anyway).
 * @param {Element} root
 * @returns {{index: number, text: string, offset: number}|null}
 */
function readPlace(root) {
    if (!root) return null;
    const scroller = scrollerOf(root);
    if (scroller.scrollTop < 4) return null;
    const top = viewTop(scroller);
    const blocks = blocksIn(root);
    const index = blocks.findIndex((el) => el.getBoundingClientRect().bottom > top + 1);
    if (index === -1) return null;
    // offset: how far below the top of the box the paragraph starts
    // (negative when its first lines are scrolled out of sight).
    return { index, text: textOf(blocks[index]), offset: blocks[index].getBoundingClientRect().top - top };
}

/** Scroll `root`'s box so the kept paragraph is where it was. Returns false when there's nothing to scroll to yet. */
function scrollToPlace(root, place) {
    const blocks = blocksIn(root);
    if (blocks.length === 0) return false;
    let target = null;
    if (place.text) {
        // The paragraph with the same text nearest to where it was.
        let best = Infinity;
        blocks.forEach((el, i) => {
            if (Math.abs(i - place.index) < best && textOf(el) === place.text) {
                best = Math.abs(i - place.index);
                target = el;
            }
        });
    }
    if (!target) target = blocks[Math.min(place.index, blocks.length - 1)];
    const scroller = scrollerOf(root);
    scroller.scrollTop += target.getBoundingClientRect().top - viewTop(scroller) - place.offset;
    return true;
}

const kept = new Map(); // note id -> { place, at }

/**
 * Note where the reader is in a note, right before switching screens.
 * @param {string} noteId
 * @param {Element|null} root the element holding the note's text
 */
export function keepPlace(noteId, root) {
    const place = readPlace(root);
    if (place) kept.set(noteId, { place, at: Date.now() });
    else kept.delete(noteId);
}

/** The place kept for a note (once: it's forgotten when taken). */
function takePlace(noteId) {
    const entry = kept.get(noteId);
    kept.delete(noteId);
    return entry && Date.now() - entry.at < KEEP_FOR_MS ? entry.place : null;
}

/**
 * When a note's screen opens (`ready`), scroll it to the place kept for it,
 * if any. The text may not be drawn yet (the editor loads its code first),
 * and formulas and pictures can still change heights after it is, so it
 * tries again for a moment — unless you scroll yourself in between.
 *
 * @param {string|null} noteId
 * @param {() => Element|null} getRoot finds the element holding the text
 * @param {boolean} ready whether the note's text is there to show
 */
export function useRestoredPlace(noteId, getRoot, ready) {
    useEffect(() => {
        if (!ready || !noteId) return undefined;
        const place = takePlace(noteId);
        if (!place) return undefined;
        let stopped = false;
        let lastTop = null; // where we last scrolled it
        const timers = [];
        const apply = () => {
            if (stopped) return;
            const root = getRoot();
            if (!root) return;
            const scroller = scrollerOf(root);
            // Scrolled by hand since our last try: leave it.
            if (lastTop !== null && Math.abs(scroller.scrollTop - lastTop) > 2) { stopped = true; return; }
            if (scrollToPlace(root, place)) lastTop = scrollerOf(root).scrollTop;
        };
        [0, 60, 200, 450, 900, 1600, 2500].forEach((ms) => timers.push(setTimeout(apply, ms)));
        return () => { stopped = true; timers.forEach(clearTimeout); };
    }, [noteId, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
