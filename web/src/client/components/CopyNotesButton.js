import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { getCardContent } from '../actions';
import { copyNotes } from '../utils/copyNotes';

// "Copy" for admins on the desktop notebook overview (utils/copyNotes.js):
// puts the given notes on the clipboard, formatted and as plain text.
// `getItems()` is read at click time (what's shown, or what's ticked).
// Shows Copying… while the notes' text loads, then Copied ✓ or an error.
export default function CopyNotesButton({ title, getItems, label = 'Copy', className = 'cb-btn cb-btn--ghost' }) {
    const dispatch = useDispatch();
    const [state, setState] = useState('idle'); // idle | copying | done | failed

    const onClick = () => {
        const items = getItems();
        if (!items.length) return;
        setState('copying');
        copyNotes(title, items, (id) => dispatch(getCardContent(id)))
            .then(() => setState('done'))
            .catch(() => setState('failed'))
            .finally(() => setTimeout(() => setState('idle'), 2500));
    };

    const text = { idle: label, copying: 'Copying…', done: 'Copied ✓', failed: 'Couldn’t copy' }[state];
    return (
        <button type="button" className={`${className} copy-notes${state === 'failed' ? ' copy-notes--failed' : ''}`}
            onClick={onClick} disabled={state === 'copying'}
            title="Copy to the clipboard (paste into Google Docs, Word or any text app)">
            <i className={`${state === 'copying' ? 'spinner loading' : 'copy outline'} icon`} aria-hidden="true"></i>
            {text}
        </button>
    );
}
