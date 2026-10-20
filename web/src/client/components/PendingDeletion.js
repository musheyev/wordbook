import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { keepAccount, logoutCurrentUser } from '../actions';
import { formatDeletionDate, takeScheduledNotice } from '../utils/deletionDate';

// The 7-day grace period after Delete account (api/account.js), on screen.
//
// PendingDeletion — signed in to an account that's waiting to be deleted:
// instead of the app, the date, and a choice. Keep my account takes the
// deletion off; Continue with deletion signs out again and leaves it to
// happen on the date. (App.js shows this when state.accountDeletion is set.)
//
// DeletionScheduledNotice — right after Delete account the user is signed
// out; the start page then says when it will happen, once.

export function PendingDeletion() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const dueAt = useSelector((state) => state.accountDeletion);
    const username = useSelector((state) => state.auth);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [kept, setKept] = useState(false);
    if (!dueAt && !kept) return null;

    const onKeep = async () => {
        setBusy('keep');
        setError('');
        try {
            await dispatch(keepAccount());
            setKept(true);
        } catch (err) {
            setError(err.message);
        }
        setBusy('');
    };
    // Sign out again (like Log out), back on the start page.
    const onContinue = async () => {
        setBusy('continue');
        await dispatch(logoutCurrentUser());
        setBusy('');
        navigate('/', { replace: true });
    };

    if (kept) {
        return (
            <div className="pending-deletion pending-deletion--kept" role="status">
                <i className="check circle outline icon" aria-hidden="true"></i>
                <span>Your account is kept. Nothing will be deleted.</span>
                <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setKept(false)}>OK</button>
            </div>
        );
    }

    return (
        <div className="pending-deletion__screen">
            <div className="pending-deletion">
                <h2 className="pending-deletion__title">Your account is scheduled for deletion</h2>
                <p>
                    The account <strong>{username}</strong> and everything in it will be deleted on or shortly
                    after <strong>{formatDeletionDate(dueAt)}</strong>.
                </p>
                <p>If you’d like to keep it, choose Keep my account. Nothing has been deleted yet.</p>
                {error && <p className="cb-sheet__error">{error}</p>}
                <div className="pending-deletion__actions">
                    <button type="button" className="cb-btn cb-btn--accent" disabled={!!busy} onClick={onKeep}>
                        {busy === 'keep' ? 'Keeping…' : 'Keep my account'}
                    </button>
                    <button type="button" className="cb-btn cb-btn--ghost" disabled={!!busy} onClick={onContinue}>
                        Continue with deletion
                    </button>
                </div>
            </div>
        </div>
    );
}

export function DeletionScheduledNotice() {
    const [dueAt, setDueAt] = useState(takeScheduledNotice);
    if (!dueAt) return null;
    return (
        <div className="pending-deletion pending-deletion--notice" role="status">
            <i className="calendar alternate outline icon" aria-hidden="true"></i>
            <span>
                Your account will be deleted on or shortly after <strong>{formatDeletionDate(dueAt)}</strong>.
                Sign in before then if you want to keep it.
            </span>
            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setDueAt(null)}>OK</button>
        </div>
    );
}
