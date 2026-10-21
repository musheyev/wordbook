import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { addWordbook, ADD_WORDBOOK_CLEAR_ERROR_MESSAGE, ADD_WORDBOOK_ERROR_MESSAGE } from '../actions';
import { useIsOffline } from './DownloadBadge';
import { notebookPath } from '../utils/notebookPaths';

// "+ New" at the top right of My Notebooks, beside the title, and the small
// window it opens to name the notebook.
//
// It replaced an always-open "New notebook" box at the top of the page,
// which took a lot of room on phones and looked like a search field: people
// typed into it expecting to filter their notebooks. Now the first field on
// the page is the real search.
//
// Create (or Return) adds the notebook (actions addWordbook) and opens it, so
// the next step — adding words and notes — is right there. A problem (an
// empty name, one already used) is shown in the window, which stays open
// with the name as typed. Needs a connection (iPhone app offline: greyed out).
//
// On My Wordbooks (`kind="wordbook"`) it makes a wordbook instead, which My
// Wordbooks lists; everything else about it is the same.
export default function NewNotebookButton({ kind = 'notebook' }) {
    const one = kind === 'wordbook' ? 'wordbook' : 'notebook';
    const One = one[0].toUpperCase() + one.slice(1);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const noConnection = useIsOffline();
    const apiError = useSelector((state) => state.errorAPI);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const serverError = apiError && apiError.action_type === ADD_WORDBOOK_ERROR_MESSAGE && apiError.message
        ? apiError.message : '';
    const clearServerError = () => { if (serverError) dispatch({ type: ADD_WORDBOOK_CLEAR_ERROR_MESSAGE }); };

    const close = () => { setOpen(false); setName(''); setError(''); clearServerError(); };

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy]);

    const onCreate = async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) { setError(`Type a name for the ${one}.`); inputRef.current && inputRef.current.focus(); return; }
        setBusy(true);
        setError('');
        const added = await dispatch(addWordbook(trimmed, kind));
        setBusy(false);
        if (added) {
            close();
            navigate(notebookPath(trimmed));
        }
    };

    return (
        <>
            <button type="button" className="cb-btn cb-btn--accent new-notebook__btn" disabled={noConnection}
                title={noConnection ? 'Needs a connection' : `Create a ${one}`}
                onClick={() => { clearServerError(); setOpen(true); }}>
                <i className="plus icon" aria-hidden="true"></i>New
            </button>

            {open && (
                <div className="cb-dialog__overlay" onMouseDown={() => !busy && close()}>
                    <form className="cb-dialog" role="dialog" aria-modal="true" aria-labelledby="new-notebook-title"
                        onMouseDown={(e) => e.stopPropagation()} onSubmit={onCreate}>
                        <h3 className="cb-dialog__title" id="new-notebook-title">New {one}</h3>
                        <input ref={inputRef} type="text" className="new-notebook__input" placeholder={`${One} name`}
                            aria-label={`${One} name`} value={name} autoFocus autoComplete="off" disabled={busy}
                            onChange={(e) => { setName(e.target.value); setError(''); clearServerError(); }} />
                        {(error || serverError) && <p className="cb-sheet__error">{error || serverError}</p>}
                        <div className="cb-dialog__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" disabled={busy} onClick={close}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={busy}>
                                {busy ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
