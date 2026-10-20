import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { deleteAccount } from '../actions';
import { useIsOffline } from './DownloadBadge';

// The "Account" section at the bottom of My Notebooks: who's signed in, and
// Delete account. Apple requires apps that let people sign up to let them
// delete their account inside the app (App Store guideline 5.1.1(v)); the
// website offers it too.
//
// Deleting is permanent, so the dialog says what goes and asks for the word
// DELETE to be typed before the button works. Then the server deletes
// everything (api/account.js) and the user is signed out, back on the start
// page. With no connection (iPhone app) it's greyed out.
const CONFIRM_WORD = 'DELETE';

export default function DeleteAccount() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const username = useSelector((state) => state.auth);
    const noConnection = useIsOffline();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { if (open) { setTyped(''); setError(''); } }, [open]);
    useEffect(() => {
        if (!open || busy) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy]);

    if (!username) return null;
    const ready = typed.trim().toUpperCase() === CONFIRM_WORD && !busy;

    const onDelete = async () => {
        setBusy(true);
        setError('');
        try {
            await dispatch(deleteAccount(username));
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <div className="account-section">
            <div className="account-section__text">
                <strong>Account</strong>
                <span className="account-section__sub">Signed in as {username}</span>
            </div>
            <button type="button" className="cb-btn cb-btn--ghost account-section__delete"
                disabled={noConnection} title={noConnection ? 'Needs a connection' : undefined}
                onClick={() => setOpen(true)}>
                Delete account…
            </button>

            {open && (
                <div className="cb-dialog__overlay" onMouseDown={() => !busy && setOpen(false)}>
                    <div className="cb-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title"
                        onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="cb-dialog__title" id="delete-account-title">Delete your account?</h3>
                        <p className="cb-dialog__msg">
                            This permanently deletes the account <strong>{username}</strong> and everything in it:
                            your notebooks, notes, words, tags, images, history and settings. Notes you shared stay
                            with the people you shared them with. This can’t be undone.
                        </p>
                        <label className="account-section__confirm">
                            Type <strong>{CONFIRM_WORD}</strong> to confirm
                            <input type="text" value={typed} autoFocus autoCapitalize="characters" autoComplete="off"
                                onChange={(e) => setTyped(e.target.value)} disabled={busy} />
                        </label>
                        {error && <p className="cb-sheet__error">{error}</p>}
                        <div className="cb-dialog__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" disabled={busy}
                                onClick={() => setOpen(false)}>Cancel</button>
                            <button type="button" className="cb-btn cb-btn--danger" disabled={!ready} onClick={onDelete}>
                                {busy ? 'Deleting…' : 'Delete account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
