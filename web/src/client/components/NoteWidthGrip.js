import React, { useRef } from 'react';

// How wide an open note is on desktop (reading or editing): a small corner
// grip at the bottom right of the note, dragged sideways. Narrower lines are
// easier to read on a wide screen, without making the browser window
// narrower. Double-click the grip for the full width again.
//
// The width is kept on this computer (localStorage) and is the same for every
// note. It's applied as a CSS variable, --note-w, on the page root; styles.css
// limits the note column (#worddefinition > the note) to it, on desktop only.
// Phones, the iPhone app and the floating note windows aren't affected.

const KEY = 'note-width';
const MIN = 360; // the note's buttons still fit

const root = () => document.documentElement;
const setWidth = (px) => {
    if (px) root().style.setProperty('--note-w', `${px}px`);
    else root().style.removeProperty('--note-w');
};

// Applied as soon as this file loads (the note view and the editor import it).
try {
    const saved = Number(localStorage.getItem(KEY));
    if (saved >= MIN) setWidth(saved);
} catch (e) { /* storage blocked: full width */ }

const save = (px) => {
    try {
        if (px) localStorage.setItem(KEY, String(Math.round(px)));
        else localStorage.removeItem(KEY);
    } catch (e) { /* not kept; still applied for now */ }
};

/** The corner grip. Place it inside the note's column (it's absolutely positioned). */
export default function NoteWidthGrip() {
    const ref = useRef(null);

    const onPointerDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const column = ref.current && ref.current.parentElement;
        const area = column && column.parentElement; // #worddefinition
        if (!column || !area) return;
        const style = getComputedStyle(area);
        const room = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const startX = e.clientX;
        const startW = column.getBoundingClientRect().width;
        let last = startW;
        document.body.classList.add('note-width-dragging');

        const onMove = (ev) => {
            last = Math.max(MIN, Math.min(room, startW + ev.clientX - startX));
            // Within a few pixels of the whole width counts as the whole width.
            setWidth(last >= room - 4 ? null : last);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.classList.remove('note-width-dragging');
            save(last >= room - 4 ? null : last);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const reset = () => { setWidth(null); save(null); };

    return (
        <button type="button" ref={ref} className="note-width-grip" onPointerDown={onPointerDown}
            onDoubleClick={reset} aria-label="Note width: drag sideways; double-click for full width"
            title="Drag to make the note narrower or wider · double-click: full width">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M11 4L4 11M11 8L8 11" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            </svg>
        </button>
    );
}
