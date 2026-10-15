import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { TTS_PAUSES } from '../utils/tts';
import {
    setAllPauses, addSpanishPauses, removeSpanishPauses, removeAllPauses, countPauses,
} from '../utils/pauseMarkup';
import useNoteChange from '../utils/useNoteChange';
import NoteChangeToast from './NoteChangeToast';

// "Audio pauses" on a note's toolbar (admins, next to Markup Spanish):
// change the note's read-aloud pauses all at once, without opening the
// editor (utils/pauseMarkup.js):
//
//   All pauses (12)         [1s] [2s] [3s] [5s]
//   Between Spanish lines   [1s] [2s] [3s] [5s]
//   Remove pauses between Spanish lines
//   Remove all pauses
//
// Saved straight away, with Undo (utils/useNoteChange.js).
export default function AudioPausesButton({ card }) {
    const isAdmin = useSelector((state) => state.isAdmin);
    const [open, setOpen] = useState(false);
    const note = useNoteChange(card);

    if (!isAdmin) return null;

    const total = countPauses(card.content);
    const pauses = (n) => `${n} ${n === 1 ? 'pause' : 'pauses'}`;
    const run = (...args) => { setOpen(false); note.run(...args); };

    const lengths = (onPick) => (
        <span className="pause-menu__lengths">
            {TTS_PAUSES.map((s) => (
                <button type="button" key={s} className="pause-menu__len" onClick={() => onPick(s)}>{s}s</button>
            ))}
        </span>
    );

    return (
        <span className="es-markup">
            <button type="button" className="cb-btn cb-btn--ghost es-markup__btn" disabled={note.busy}
                aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
                title="Change this note's read-aloud pauses all at once">
                {note.busy ? <i className="spinner loading icon" aria-hidden="true"></i> : null}
                Audio pauses <i className="angle down icon" aria-hidden="true"></i>
            </button>
            {open && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="cb-menu__list pause-menu" role="menu">
                        <div className="pause-menu__row">
                            <span className="pause-menu__label">
                                Set all pauses
                                <span className="pause-menu__hint">{total ? `${pauses(total)} now` : 'none yet'}</span>
                            </span>
                            {lengths((s) => run((h) => setAllPauses(h, s),
                                (n) => `Set ${pauses(n)} to ${s}s.`,
                                total ? `All pauses are already ${s}s.` : 'This note has no pauses.'))}
                        </div>
                        <div className="pause-menu__row">
                            <span className="pause-menu__label">
                                Add between Spanish lines
                                <span className="pause-menu__hint">after a line with Spanish, before the next</span>
                            </span>
                            {lengths((s) => run((h) => addSpanishPauses(h, s),
                                (n) => `Added ${pauses(n)} of ${s}s between Spanish lines.`,
                                'No Spanish lines without a pause between them.'))}
                        </div>
                        <div className="pause-menu__sep" role="separator" />
                        <button type="button" role="menuitem"
                            onClick={() => run(removeSpanishPauses, (n) => `Removed ${pauses(n)} between Spanish lines.`,
                                'No pauses between Spanish lines.')}>
                            Remove pauses between Spanish lines
                        </button>
                        <button type="button" role="menuitem" className="cb-menu__danger"
                            onClick={() => run(removeAllPauses, (n) => `Removed ${pauses(n)}.`, 'This note has no pauses.')}>
                            Remove all pauses
                        </button>
                    </div>
                </>
            )}
            <NoteChangeToast note={note} />
        </span>
    );
}
