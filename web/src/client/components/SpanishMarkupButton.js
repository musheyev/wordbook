import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { markSpanish, removeSpanish } from '../utils/spanishMarkup';
import useNoteChange from '../utils/useNoteChange';
import NoteChangeToast from './NoteChangeToast';

// "Markup Spanish" on a note's toolbar (admins only, for now): without
// opening the editor, mark the note's Spanish to be read in Spanish (Spain),
// or remove its Spanish marks (utils/spanishMarkup.js). Saved straight away,
// with Undo (utils/useNoteChange.js).
export default function SpanishMarkupButton({ card }) {
    const isAdmin = useSelector((state) => state.isAdmin);
    const [open, setOpen] = useState(false);
    const note = useNoteChange(card);

    if (!isAdmin) return null;

    const places = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;
    const run = (...args) => { setOpen(false); note.run(...args); };

    return (
        <span className="es-markup">
            <button type="button" className="cb-btn cb-btn--ghost es-markup__btn" disabled={note.busy}
                aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
                title="Find the Spanish in this note and mark it to be read in Spanish">
                {note.busy ? <i className="spinner loading icon" aria-hidden="true"></i> : null}
                Markup Spanish <i className="angle down icon" aria-hidden="true"></i>
            </button>
            {open && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="cb-menu__list es-markup__menu" role="menu">
                        <button type="button" role="menuitem"
                            onClick={() => run(markSpanish, (n) => `Marked Spanish in ${places(n)}.`, 'No unmarked Spanish found.')}>
                            Mark Spanish
                        </button>
                        <button type="button" role="menuitem"
                            onClick={() => run(removeSpanish, (n) => `Removed Spanish markup from ${places(n)}.`, 'This note has no Spanish markup.')}>
                            Remove Spanish markup
                        </button>
                    </div>
                </>
            )}
            <NoteChangeToast note={note} />
        </span>
    );
}
