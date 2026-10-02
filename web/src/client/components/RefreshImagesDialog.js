import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { refreshWordImages } from '../actions';

// "Get new images" dialog (admins; opened from a word's Refresh images).
//
//   Fewer than 5 shown   pick how many to add, 1 to (5 − shown), defaulting
//                        to 5 − shown (fill every empty slot)
//   All 5 shown          offer "Replace all 5" instead
//
// New images never repeat ones already shown or ever deleted/replaced for
// this word (the server keeps those in the word's `removed` list).

const MAX_IMAGES = 5;

function RefreshImagesDialog({ open, word, shown, onClose, refreshWordImages }) {
    const room = Math.max(0, MAX_IMAGES - shown);
    const [count, setCount] = useState(room);
    const [status, setStatus] = useState('idle'); // idle | working | done
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    // Start from the default every time the dialog opens.
    useEffect(() => {
        if (open) {
            setCount(room);
            setStatus('idle');
            setResult(null);
            setError('');
        }
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const replaceAll = room === 0;

    const onSubmit = async (e) => {
        e.preventDefault();
        setStatus('working');
        setError('');
        try {
            const outcome = await refreshWordImages(word, replaceAll ? { replaceAll: true } : { count });
            setResult(outcome);
            setStatus('done');
        } catch (err) {
            setError(err.message);
            setStatus('idle');
        }
    };

    const plural = (n) => `${n} ${n === 1 ? 'image' : 'images'}`;

    return (
        <div className="cb-sheet__overlay" onMouseDown={onClose}>
            <form className="cb-sheet" role="dialog" aria-modal="true" aria-label="Get new images"
                onMouseDown={(e) => e.stopPropagation()} onSubmit={onSubmit}>
                <div className="cb-sheet__grab" aria-hidden="true" />

                {status === 'done' ? (
                    <>
                        <h3 className="cb-sheet__title">
                            {result.added === 0 ? 'No new images found' : `Added ${plural(result.added)}`}
                        </h3>
                        {result.added < result.requested && (
                            <p className="refresh-sheet__text">
                                The search had only {result.added === 0 ? 'no' : result.added} new
                                {' '}{result.added === 1 ? 'image' : 'images'} for “{word}”, not counting
                                ones already shown or deleted before.
                            </p>
                        )}
                        <div className="cb-sheet__actions">
                            <button type="button" className="cb-btn cb-btn--accent" onClick={onClose} autoFocus>Done</button>
                        </div>
                    </>
                ) : replaceAll ? (
                    <>
                        <h3 className="cb-sheet__title">Replace images for “{word}”</h3>
                        <p className="refresh-sheet__text">
                            All 5 slots are in use. Replace them with 5 new images? The current
                            ones won't come back in future refreshes. This changes the images
                            every user sees.
                        </p>
                        {error && <div className="cb-sheet__error">{error}</div>}
                        <div className="cb-sheet__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={status === 'working'}>
                                {status === 'working' ? 'Replacing…' : 'Replace all 5'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3 className="cb-sheet__title">Get new images for “{word}”</h3>
                        <p className="refresh-sheet__text">
                            {plural(shown)} shown. Add up to {room} more. This changes the images
                            every user sees.
                        </p>
                        <div className="stepper" role="group" aria-label="Number of new images">
                            <button type="button" className="stepper__btn" aria-label="Fewer"
                                disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))}>−</button>
                            <output className="stepper__value" aria-live="polite">{count}</output>
                            <button type="button" className="stepper__btn" aria-label="More"
                                disabled={count >= room} onClick={() => setCount((n) => Math.min(room, n + 1))}>+</button>
                        </div>
                        {error && <div className="cb-sheet__error">{error}</div>}
                        <div className="cb-sheet__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={status === 'working'}>
                                {status === 'working' ? 'Getting images…' : `Add ${plural(count)}`}
                            </button>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
}

export default connect(null, { refreshWordImages })(RefreshImagesDialog);
