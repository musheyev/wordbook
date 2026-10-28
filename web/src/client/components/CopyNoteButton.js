import React, { useEffect, useRef, useState } from 'react';

// "Copy" on a note's toolbar (SearchResult.js), for everyone: puts the note
// on the clipboard as it looks on screen — its title, then its text with
// the headings, bold, colours, highlights, lists, tables and drawn formulas
// you see — for pasting into Google Docs, Word, Mail or Notes.
//
// It copies the way selecting the note and pressing ⌘C would: a copy of the
// shown note goes into a box off the edge of the screen, styled like a note
// (class card-content), the box is selected, and the browser's own Copy
// command copies the selection with its look (and a plain-text version too,
// for apps that only take text). So there's nothing to convert: what's on
// screen is what's copied. The read-aloud chips (pauses, bookmarks) are left
// out; they're marks for the player, not text. Pictures come along as links
// to them, which an app outside the site may not be able to open.

const DONE_MS = 2500;

/**
 * Copy what's shown.
 * @param {string} title
 * @param {Element} shown the note's displayed text (.note-zoom-text)
 * @returns {boolean} whether the browser copied it
 */
function copyShown(title, shown) {
    const box = document.createElement('div');
    box.className = 'card-content copy-note__box';
    box.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h2');
    heading.textContent = title;
    box.appendChild(heading);
    const body = shown.cloneNode(true);
    // Read-aloud chips, and each formula's hidden copy for screen readers
    // (KaTeX's .katex-mathml), which some apps would paste as extra text.
    body.querySelectorAll('.tts-pause, .tts-bookmark, .katex-mathml').forEach((n) => n.remove());
    box.appendChild(body);
    document.body.appendChild(box);

    const selection = window.getSelection();
    const before = [];
    for (let i = 0; i < selection.rangeCount; i += 1) before.push(selection.getRangeAt(i));
    const range = document.createRange();
    range.selectNodeContents(box);
    selection.removeAllRanges();
    selection.addRange(range);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    selection.removeAllRanges();
    before.forEach((r) => selection.addRange(r));
    box.remove();
    return ok;
}

/**
 * @param {object} props
 * @param {string} props.title the note's title (copied first, as a heading)
 * @param {() => Element|null} props.getShown the note's displayed text, read at click time
 */
export default function CopyNoteButton({ title, getShown }) {
    const [state, setState] = useState('idle'); // idle | done | failed
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);

    const onClick = () => {
        const shown = getShown();
        const ok = !!shown && copyShown(title, shown);
        setState(ok ? 'done' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), DONE_MS);
    };

    const label = { idle: 'Copy', done: 'Copied', failed: 'Couldn’t copy' }[state];
    return (
        <button type="button" className={`card-tool copy-note${state !== 'idle' ? ` copy-note--${state}` : ''}`}
            title={state === 'idle' ? 'Copy this note, as it looks, to paste into Docs, Word, Mail…' : label}
            aria-label={label} onClick={onClick}>
            <i className={`${state === 'done' ? 'check' : state === 'failed' ? 'exclamation' : 'copy outline'} icon`}
                aria-hidden="true"></i>
        </button>
    );
}
