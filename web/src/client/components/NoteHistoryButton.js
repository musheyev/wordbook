import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { restoreNoteVersion } from '../actions';
import { reportNoteAudio } from '../utils/ttsPlayer';
import NoteChangeToast from './NoteChangeToast';

// The History button in a note's toolbar (SearchResult), and the message
// after a restore: "Restored the version from Nov 18, 1:40 PM · Undo".
// Undo restores the version the server kept from just before the restore,
// so the note is back to what it was.
//
// The History window itself (NoteHistory.js, with the `diff` library) is
// downloaded only when it's first opened: most visits never need it.
const NoteHistory = lazy(() => import('./NoteHistory'));

const UNDO_MS = 10000;

/**
 * @param {object} props
 * @param {{card_id: string, title: string, content: string}} props.card
 * @param {boolean} [props.disabled] e.g. offline: the history is on the server
 * @param {string} [props.disabledTitle]
 */
export default function NoteHistoryButton({ card, disabled, disabledTitle }) {
    const dispatch = useDispatch();
    const [open, setOpen] = useState(false);
    const [toast, setToast] = useState(null); // { text, before? }
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);

    const show = (next) => {
        clearTimeout(timer.current);
        setToast(next);
        timer.current = setTimeout(() => setToast(null), UNDO_MS);
    };

    const onRestored = useCallback(({ before, when }) => {
        show({ text: `Restored the version from ${when}.`, ...(before ? { before } : {}) });
    }, []);
    const close = useCallback(() => setOpen(false), []);

    const undo = async () => {
        if (!toast || !toast.before) return;
        const { before } = toast;
        setToast(null);
        try {
            const { card: back } = await dispatch(restoreNoteVersion(card.card_id, before));
            reportNoteAudio(`card:${card.card_id}`, back.content);
            show({ text: 'Back to the latest version.' });
        } catch (err) {
            show({ text: 'Couldn’t undo. Open History to restore it.' });
        }
    };

    return (
        <>
            <button type="button" className="card-tool" title={disabled ? disabledTitle : 'History'}
                aria-label="History" disabled={disabled} onClick={() => setOpen(true)}>
                <i className="history icon"></i>
            </button>
            {open && (
                <Suspense fallback={null}>
                    <NoteHistory card={card} onClose={close} onRestored={onRestored} />
                </Suspense>
            )}
            <NoteChangeToast note={{ toast, undo }} />
        </>
    );
}
