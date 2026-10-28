import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import { fetchBookmarks, setBookmark, clearBookmarks } from '../actions';
import { bookmarkPath } from '../utils/bookmarks';

// My Bookmarks (/bookmarks; linked from More and the desktop rail): the notes
// and words starred with ☆ (components/BookmarkButton.js), newest first.
//
//   My Bookmarks                               [Clear all]
//   📝 Spanish verbs                                    ✕
//      Note · Oct 28
//   Aa hablar                                           ✕
//      Word · Oct 27
//
// Tap one to open it, in a notebook that has it (utils/bookmarks.js), with a
// "Previous / Next" bar for going through the bookmarks. ✕ removes a bookmark
// at once, with Undo for a moment; Clear all asks first. The notes and words
// themselves are never touched.

const UNDO_MS = 6000;

const dateOf = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
};

function BookmarksPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const bookmarks = useSelector((state) => state.bookmarks);
    const [loadError, setLoadError] = useState('');
    const [error, setError] = useState('');
    const [removed, setRemoved] = useState(null); // the bookmark Undo would bring back
    const [clearing, setClearing] = useState(false);
    const [opening, setOpening] = useState(null); // key of the one being opened
    const undoTimer = useRef(null);

    // Fresh every time the page opens (another device may have changed them).
    useEffect(() => {
        dispatch(fetchBookmarks())
            .then(() => setLoadError(''))
            .catch(() => setLoadError('Couldn’t load your bookmarks. Check your connection.'));
        return () => clearTimeout(undoTimer.current);
    }, []);

    const keyOf = (b) => `${b.type}:${b.id}`;

    const open = async (b) => {
        setError('');
        setOpening(keyOf(b));
        try {
            const path = await bookmarkPath(dispatch, b);
            if (path) navigate(path);
            else setError(`“${b.title}” isn’t in any notebook now, so there’s nowhere to open it.`);
        } catch (err) {
            setError('Couldn’t open that bookmark. Check your connection and try again.');
        }
        setOpening(null);
    };

    const remove = (b) => {
        setError('');
        clearTimeout(undoTimer.current);
        setRemoved(b);
        undoTimer.current = setTimeout(() => setRemoved(null), UNDO_MS);
        dispatch(setBookmark(b, false)).catch(() => {
            setRemoved(null);
            setError(`Couldn’t remove “${b.title}”. Check your connection and try again.`);
        });
    };

    const undo = () => {
        const b = removed;
        clearTimeout(undoTimer.current);
        setRemoved(null);
        // Back in its place: it keeps when it was first bookmarked.
        dispatch(setBookmark(b, true)).catch(() => setError(`Couldn’t put back “${b.title}”.`));
    };

    const confirmClear = () => {
        setClearing(false);
        setRemoved(null);
        setError('');
        dispatch(clearBookmarks()).catch(() => setError('Couldn’t clear your bookmarks. Check your connection and try again.'));
    };

    const list = bookmarks || [];
    return (
        <div className="cb-account">
            <div className="cb-account__head bookmarks__head">
                <h1 className="cb-page-title">My Bookmarks</h1>
                {list.length > 0 && (
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setClearing(true)}>Clear all</button>
                )}
            </div>

            {removed && (
                <div className="bookmarks__undo" role="status">
                    <span>Removed “{removed.title}”.</span>
                    <button type="button" className="bookmarks__undobtn" onClick={undo}>Undo</button>
                </div>
            )}
            {(error || (loadError && bookmarks === null)) && <div className="cb-sheet__error">{error || loadError}</div>}

            {bookmarks === null ? (
                loadError ? null : <Spinner label="Loading bookmarks…" />
            ) : list.length === 0 ? (
                <div className="cb-empty">
                    No bookmarks yet. Open a note or a word and tap ☆ to keep it here.
                </div>
            ) : (
                <ul className="bookmarks">
                    {list.map((b) => (
                        <li key={keyOf(b)} className="bookmarks__row">
                            <button type="button" className="bookmarks__open" onClick={() => open(b)}
                                disabled={opening === keyOf(b)}>
                                <span className={`bookmarks__kind bookmarks__kind--${b.type}`} aria-hidden="true">
                                    {b.type === 'card' ? '📝' : 'Aa'}
                                </span>
                                <span className="bookmarks__text">
                                    <span className="bookmarks__title">{b.title || 'Untitled'}</span>
                                    <span className="bookmarks__meta">
                                        {b.type === 'card' ? 'Note' : 'Word'}{dateOf(b.at) ? ` · ${dateOf(b.at)}` : ''}
                                    </span>
                                </span>
                                {opening === keyOf(b) && <i className="spinner loading icon" aria-hidden="true"></i>}
                            </button>
                            <button type="button" className="bookmarks__remove" aria-label={`Remove the bookmark on ${b.title}`}
                                title="Remove this bookmark (the note stays)" onClick={() => remove(b)}>
                                <i className="close icon" aria-hidden="true"></i>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog
                open={clearing}
                title={`Remove all ${list.length} bookmark${list.length === 1 ? '' : 's'}?`}
                message="My Bookmarks will be empty. Your notes and words stay as they are."
                confirmLabel="Clear all"
                tone="danger"
                onConfirm={confirmClear}
                onCancel={() => setClearing(false)}
            />
        </div>
    );
}

export default requireAuth(BookmarksPage);
