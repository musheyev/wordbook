// Text size for the note that's open (NoteZoomButton): make its text bigger
// or smaller on this screen only. The note itself doesn't change — unlike the
// editor's Font size, which is saved into the note.
//
// Every note opens at 100%, and nothing is saved. The size lasts only while
// the note stays on screen, carrying over when you switch between reading
// and editing it; leave the note (another note, the notebook's list, any
// other page) and it's back to 100% next time.
//
// So it lives here, in memory: the size, and how many views of the note are
// showing it right now (the reading view, the editor). When the last one
// goes away and no other takes its place straight after — as the editor
// does when you press Edit — the size is forgotten.
//
// The size is applied with CSS `zoom` on the note's text (not its scrolling
// box), so everything in the text grows together: headings, text given a
// Font size, images, formulas.
import { useEffect, useState } from 'react';

/** The sizes A− and A+ step through. 1 = 100%. */
export const NOTE_ZOOM_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

// The open note's size, and how many views of it are showing.
let current = { key: null, level: 1 };
let showing = 0;

/**
 * The text size of the note `key` (its card_id, or "new" while writing a new
 * one), and a setter. With no key (no note open) it's 100% and touches
 * nothing.
 *
 * @param {string|null} key
 * @returns {[number, (level: number) => void]}
 */
export function useNoteZoom(key) {
    const [level, setLevelState] = useState(() => (key && current.key === key ? current.level : 1));

    useEffect(() => {
        if (!key) return undefined;
        if (current.key !== key) {
            current = { key, level: 1 };
            setLevelState(1);
        }
        showing += 1;
        return () => {
            showing -= 1;
            // After this render's other views have mounted (Edit swaps the
            // reading view for the editor): nothing showing it, forget it.
            setTimeout(() => {
                if (showing === 0 && current.key === key) current = { key: null, level: 1 };
            }, 0);
        };
    }, [key]);

    const setLevel = (next) => {
        if (!key) return;
        current = { key, level: next };
        setLevelState(next);
    };
    return [key ? level : 1, setLevel];
}

/** The next size up (dir 1) or down (dir -1), staying within the steps. */
export function stepZoom(level, dir) {
    const i = NOTE_ZOOM_STEPS.findIndex((s) => Math.abs(s - level) < 0.001);
    const at = i === -1 ? NOTE_ZOOM_STEPS.indexOf(1) : i;
    const next = Math.min(NOTE_ZOOM_STEPS.length - 1, Math.max(0, at + dir));
    return NOTE_ZOOM_STEPS[next];
}
