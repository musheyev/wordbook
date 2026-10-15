import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateCard } from '../actions';
import { reportNoteAudio } from './ttsPlayer';

// Change a note from its toolbar without opening the editor (Markup Spanish,
// Audio pauses): apply a change to its HTML, save at once, and show what
// happened with Undo for a few seconds.
//
//   const note = useNoteChange(card);
//   note.run(change, done, none)
//     change(html) -> { html, count }; done(count) -> message; none = message
//     when nothing changed (nothing is saved then)
//   note.busy, note.toast ({ text, before? }), note.undo()
const UNDO_MS = 10000;

export default function useNoteChange(card) {
    const dispatch = useDispatch();
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);

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
        if (!toast || toast.before === undefined) return;
        const { before } = toast;
        setToast(null);
        setBusy(true);
        try { await save(before); } catch (err) { show({ text: 'Couldn’t undo. Try again.' }); }
        setBusy(false);
    };

    return { busy, toast, run, undo };
}
