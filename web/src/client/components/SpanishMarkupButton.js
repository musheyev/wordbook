import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateCard } from '../actions';
import { reportNoteAudio } from '../utils/ttsPlayer';
import { markSpanish, removeSpanish } from '../utils/spanishMarkup';

// "Markup Spanish" on a note's toolbar (admins only, for now): without
// opening the editor, mark the note's Spanish to be read in Spanish (Spain),
// or remove its Spanish marks (utils/spanishMarkup.js). The note is saved
// straight away; a message says what changed, with Undo for a few seconds.
const UNDO_MS = 10000;

export default function SpanishMarkupButton({ card }) {
    const dispatch = useDispatch();
    const isAdmin = useSelector((state) => state.isAdmin);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null); // { text, before? }
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);

    if (!isAdmin) return null;

    const show = (next) => {
        clearTimeout(timer.current);
        setToast(next);
        timer.current = setTimeout(() => setToast(null), UNDO_MS);
    };

    const save = async (html) => {
        await dispatch(updateCard(card.card_id, card.title, html));
        reportNoteAudio(`card:${card.card_id}`, html);
    };

    const run = async (change, done, none) => {
        setOpen(false);
        const before = card.content || '';
        const { html, count } = change(before);
        if (!count) { show({ text: none }); return; }
        setBusy(true);
        try {
            await save(html);
            show({ text: done(count), before });
        } catch (err) {
            show({ text: 'Couldn’t save the note. Try again.' });
        }
        setBusy(false);
    };

    const undo = async () => {
        const { before } = toast;
        setToast(null);
        setBusy(true);
        try { await save(before); } catch (err) { show({ text: 'Couldn’t undo. Try again.' }); }
        setBusy(false);
    };

    const plural = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;

    return (
        <span className="es-markup">
            <button type="button" className="cb-btn cb-btn--ghost es-markup__btn" disabled={busy}
                aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
                title="Find the Spanish in this note and mark it to be read in Spanish">
                {busy ? <i className="spinner loading icon" aria-hidden="true"></i> : null}
                Markup Spanish <i className="angle down icon" aria-hidden="true"></i>
            </button>
            {open && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="cb-menu__list es-markup__menu" role="menu">
                        <button type="button" role="menuitem"
                            onClick={() => run(markSpanish, (n) => `Marked Spanish in ${plural(n)}.`, 'No unmarked Spanish found.')}>
                            Mark Spanish
                        </button>
                        <button type="button" role="menuitem"
                            onClick={() => run(removeSpanish, (n) => `Removed Spanish markup from ${plural(n)}.`, 'This note has no Spanish markup.')}>
                            Remove Spanish markup
                        </button>
                    </div>
                </>
            )}
            {toast && (
                <div className="undo-toast" role="status">
                    {toast.text}
                    {toast.before !== undefined && <button type="button" onClick={undo}>Undo</button>}
                </div>
            )}
        </span>
    );
}
