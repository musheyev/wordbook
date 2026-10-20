import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { deleteAccount } from '../actions';
import { useIsOffline } from './DownloadBadge';
import { isNativeApp } from '../native/platform';
import { nativeReauth } from '../native/auth';
import { reauthUrl } from '../utils/cognito';

// The "Account" section at the bottom of My Notebooks: who's signed in, and
// Delete account. Apple requires apps that let people sign up to let them
// delete their account inside the app (App Store guideline 5.1.1(v)); the
// website offers it too.
//
// Deleting is permanent, so:
//   1. The dialog says what goes, and why a sign-in comes next. Typing the
//      word DELETE enables "Sign in and delete".
//   2. Sign in again, with the password. Being signed in isn't proof enough:
//      someone else may be holding an unlocked phone, or using a computer
//      left signed in.
//        iPhone app  the private sign-in sheet (native/auth.js nativeReauth)
//        website     Cognito's "sign out, then sign in" page (reauthUrl),
//                    which returns here with ?delete_code=…&state=…; the
//                    state, kept in sessionStorage, shows it's our request
//   3. The server checks that sign-in is this same account, then deletes
//      everything (api/account.js), and the user is signed out, back on the
//      start page.
// With no connection (iPhone app) the button is greyed out.
const CONFIRM_WORD = 'DELETE';
const PENDING_KEY = 'delete-account-state';

const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

export default function DeleteAccount() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const username = useSelector((state) => state.auth);
    const noConnection = useIsOffline();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false); // '' | 'signing-in' | 'deleting'
    const [error, setError] = useState('');
    const handled = useRef(false);

    // A fresh start each time the button opens the dialog (not when the
    // dialog reopens to report on a sign-in, which sets its own message).
    const reset = () => { setTyped(''); setError(''); setBusy(''); };
    useEffect(() => {
        if (!open || busy) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy]);

    // With the fresh sign-in's code: ask the server to delete.
    const finish = async (proof) => {
        setBusy('deleting');
        setError('');
        try {
            await dispatch(deleteAccount(username, proof));
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy('');
        }
    };

    // Website: back from signing in again (step 2) with the code.
    useEffect(() => {
        if (handled.current || !username) return;
        const params = new URLSearchParams(location.search);
        if (!params.has('state') || !params.get('state').startsWith('delete-')) return;
        handled.current = true;
        let expected = null;
        try { expected = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* none */ }
        navigate(location.pathname, { replace: true }); // take the code out of the address bar
        const code = params.get('delete_code');
        setOpen(true);
        if (!expected || params.get('state') !== `delete-${expected}`) {
            setError('That sign-in didn’t come from this page, so nothing was deleted. Please start again.');
        } else if (!code) {
            setError('Signing in didn’t finish, so nothing was deleted.');
        } else {
            finish({ code, via: 'web' });
        }
    }, [username, location.search]);

    if (!username) return null;
    const ready = typed.trim().toUpperCase() === CONFIRM_WORD && !busy;

    // Step 2: sign in again.
    const onSignIn = async () => {
        setError('');
        if (isNativeApp()) {
            setBusy('signing-in');
            try {
                const proof = await nativeReauth();
                if (!proof) { setBusy(''); return; } // closed the sheet: nothing happens
                await finish({ ...proof, via: 'app' });
            } catch (err) {
                setError('Signing in didn’t work, so nothing was deleted. Please try again.');
                setBusy('');
            }
            return;
        }
        const state = randomState();
        try { sessionStorage.setItem(PENDING_KEY, state); } catch (e) { /* checked on return */ }
        setBusy('signing-in');
        window.location.href = reauthUrl(`delete-${state}`);
    };

    return (
        <div className="account-section">
            <div className="account-section__text">
                <strong>Account</strong>
                <span className="account-section__sub">Signed in as {username}</span>
            </div>
            <button type="button" className="cb-btn cb-btn--ghost account-section__delete"
                disabled={noConnection} title={noConnection ? 'Needs a connection' : undefined}
                onClick={() => { reset(); setOpen(true); }}>
                Delete account…
            </button>

            {open && (
                <div className="cb-dialog__overlay" onMouseDown={() => !busy && setOpen(false)}>
                    <div className="cb-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title"
                        onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="cb-dialog__title" id="delete-account-title">Delete your account?</h3>
                        {busy === 'deleting' ? (
                            <p className="cb-dialog__msg">
                                <i className="spinner loading icon" aria-hidden="true"></i>Deleting your account…
                            </p>
                        ) : (
                            <>
                                <p className="cb-dialog__msg">
                                    This permanently deletes the account <strong>{username}</strong> and everything in
                                    it: your notebooks, notes, words, tags, images, history and settings. Notes you
                                    shared stay with the people you shared them with. This can’t be undone.
                                </p>
                                <p className="cb-dialog__msg account-section__why">
                                    <i className="lock icon" aria-hidden="true"></i>
                                    For your security, you’ll sign in again with your password first. This makes sure
                                    it’s really you deleting the account, not someone else using this
                                    {isNativeApp() ? ' phone' : ' computer'}.
                                </p>
                                <label className="account-section__confirm">
                                    Type <strong>{CONFIRM_WORD}</strong> to continue
                                    <input type="text" value={typed} autoFocus autoCapitalize="characters" autoComplete="off"
                                        onChange={(e) => setTyped(e.target.value)} disabled={!!busy} />
                                </label>
                            </>
                        )}
                        {error && <p className="cb-sheet__error">{error}</p>}
                        {busy !== 'deleting' && (
                            <div className="cb-dialog__actions">
                                <button type="button" className="cb-btn cb-btn--ghost" disabled={!!busy}
                                    onClick={() => setOpen(false)}>Cancel</button>
                                <button type="button" className="cb-btn cb-btn--danger" disabled={!ready} onClick={onSignIn}>
                                    {busy === 'signing-in' ? 'Signing in…' : 'Sign in and delete'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
