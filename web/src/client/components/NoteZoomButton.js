import React, { useState } from 'react';
import { stepZoom, NOTE_ZOOM_STEPS } from '../utils/noteZoom';

// Text size for a note (utils/noteZoom.js): a button on the note's toolbar
// that opens a small bar:
//
//   [A−]  130%  [A+]  [Reset]
//
// It changes how big the note's text looks here, not the note. The same
// controls are in the editor's toolbar (RichTextEditor), so the size can be
// changed while reading and while editing.

/**
 * A−, the size, A+ and Reset. The buttons don't take focus (onMouseDown
 * preventDefault), so in the editor the cursor and selection stay put.
 */
export function NoteZoomControls({ level, onChange }) {
    const min = NOTE_ZOOM_STEPS[0];
    const max = NOTE_ZOOM_STEPS[NOTE_ZOOM_STEPS.length - 1];
    const keep = (e) => e.preventDefault();
    return (
        <span className="note-zoom__controls">
            <button type="button" className="note-zoom__step" aria-label="Smaller text" title="Smaller text"
                disabled={level <= min} onMouseDown={keep} onClick={() => onChange(stepZoom(level, -1))}>
                A−
            </button>
            <span className="note-zoom__level" aria-live="polite">{Math.round(level * 100)}%</span>
            <button type="button" className="note-zoom__step note-zoom__step--up" aria-label="Larger text" title="Larger text"
                disabled={level >= max} onMouseDown={keep} onClick={() => onChange(stepZoom(level, 1))}>
                A+
            </button>
            <button type="button" className="note-zoom__reset" disabled={level === 1}
                onMouseDown={keep} onClick={() => onChange(1)}>
                Reset
            </button>
        </span>
    );
}

/** The button on a note's toolbar while reading it (SearchResult). */
export default function NoteZoomButton({ level, onChange }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="note-zoom">
            <button type="button" className={`card-tool${level !== 1 ? ' card-tool--on' : ''}`}
                title="Text size" aria-label="Text size" aria-haspopup="true" aria-expanded={open}
                onClick={() => setOpen((v) => !v)}>
                <i className="text height icon" aria-hidden="true"></i>
            </button>
            {open && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="note-zoom__pop" role="group" aria-label="Text size">
                        <NoteZoomControls level={level} onChange={onChange} />
                    </div>
                </>
            )}
        </span>
    );
}
