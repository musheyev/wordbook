import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { shareItem } from '../actions';

// "Share with…" dialog (a bottom sheet on phones): send the current word or
// note to another user's Inbox by username.
//
// The server always answers "Sent" for any username, so this dialog never
// says whether a user exists (see api/inbox.js). It only shows errors about
// the sender's own request, such as the daily share limit or a note that's
// too large.
//
// Props:
//   open     whether the dialog is shown
//   item     what to share: { type: 'word'|'card', id, title }
//   onClose  called on Cancel, Done, Escape or a tap outside
function ShareDialog({ open, item, onClose, shareItem }) {
    const [to, setTo] = useState('');
    const [status, setStatus] = useState('idle'); // idle | sending | sent
    const [error, setError] = useState('');

    // Start fresh each time the dialog opens.
    useEffect(() => {
        if (open) {
            setTo('');
            setStatus('idle');
            setError('');
        }
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open || !item) return null;

    const onSubmit = async (e) => {
        e.preventDefault();
        const username = to.trim();
        if (username === '') {
            setError('Enter a username.');
            return;
        }
        setStatus('sending');
        try {
            await shareItem(username, { type: item.type, id: item.id });
            setStatus('sent');
        } catch (err) {
            setError(err.message);
            setStatus('idle');
        }
    };

    const kind = item.type === 'card' ? 'note' : item.type === 'notebook' ? 'notebook' : 'word';

    return (
        <div className="cb-sheet__overlay" onMouseDown={onClose}>
            <form className="cb-sheet" role="dialog" aria-modal="true" aria-label={`Share ${kind}`}
                onMouseDown={(e) => e.stopPropagation()} onSubmit={onSubmit}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <h3 className="cb-sheet__title">Share “{item.title}”</h3>

                {status === 'sent' ? (
                    <>
                        <p className="share-sheet__done">
                            <i className="check circle outline icon" aria-hidden="true"></i>
                            {/* One span for the whole sentence: in a flex row, each
                                bare text run and <strong> would otherwise be its own
                                flex item, with the gap between them. */}
                            <span>Sent to <strong>{to.trim()}</strong>. It will appear in their Inbox.</span>
                        </p>
                        <div className="cb-sheet__actions">
                            <button type="button" className="cb-btn cb-btn--accent" onClick={onClose} autoFocus>
                                Done
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <label className="share-sheet__label" htmlFor="share-to">
                            Send this {kind} to
                        </label>
                        <input id="share-to" className="cb-sheet__input" type="text" autoFocus
                            placeholder="Username" autoComplete="off" autoCapitalize="none" spellCheck="false"
                            value={to} onChange={(e) => { setTo(e.target.value); setError(''); }} />
                        {error && <div className="cb-sheet__error">{error}</div>}
                        <div className="cb-sheet__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={status === 'sending'}>
                                {status === 'sending' ? 'Sending…' : 'Send'}
                            </button>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
}

export default connect(null, { shareItem })(ShareDialog);
