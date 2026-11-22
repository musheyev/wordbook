import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getNotebookItems, openNoteWindow } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import { isPhoneLayout } from '../utils/phoneLayout';
import { colorOf } from '../utils/itemColors';
import Spinner from './Spinner';

// Another notebook's notes and words in the side panel (Header.js), while the
// page keeps showing the note that's open: picked from the notebook name's
// menu there ("Browsing"). Same rows as the current notebook's list
// (WordList, .word-chip), without the grip or ×. In window mode a note opens
// in a floating window (which remembers this notebook for its "Open on
// page"); otherwise, or for a word, it opens on the page, in this notebook.
//
// The list is fetched here, not put in the store: the store's list is the
// page's own notebook, which mustn't change while you only look around.

/**
 * @param {object} props
 * @param {string} props.notebook
 * @param {(n: number|null) => void} [props.onCount] how many items, once loaded
 */
export default function BrowseNotebookList({ notebook, onCount }) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const noteWindowMode = useSelector((state) => state.noteWindows.mode);
    const itemColors = useSelector((state) => state.itemColors);
    const openWindows = useSelector((state) => state.noteWindows.windows);
    const [items, setItems] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let gone = false;
        setItems(null);
        setError('');
        if (onCount) onCount(null);
        dispatch(getNotebookItems(notebook))
            .then((list) => { if (!gone) { setItems(list); if (onCount) onCount(list.length); } })
            .catch(() => { if (!gone) setError('Couldn’t load this notebook.'); });
        return () => { gone = true; };
    }, [notebook]); // eslint-disable-line react-hooks/exhaustive-deps

    const open = (item) => {
        if (item.type === 'card' && noteWindowMode && !isPhoneLayout()) {
            dispatch(openNoteWindow(item, notebook));
            return;
        }
        navigate(itemPath(notebook, item));
    };

    if (error) return <div className="nav-ctx__msg">{error}</div>;
    if (items === null) return <Spinner label="Loading…" />;
    if (items.length === 0) return <div className="nav-ctx__msg">This notebook is empty.</div>;
    return (
        <div className="word-chips">
            {items.map((item) => {
                const color = colorOf(itemColors, item);
                const inWindow = openWindows.some((w) => w.cardId === item.id);
                return (
                    <div key={`${item.type}:${item.id}`} role="button" tabIndex={0}
                        className={`word-chip${inWindow ? ' selected' : ''}`}
                        onClick={() => open(item)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(item); }
                        }}>
                        <span className="word-chip__dot" aria-hidden="true"
                            style={color ? { background: color.ink } : undefined} />
                        <span className="word-chip__label">{item.title}</span>
                    </div>
                );
            })}
        </div>
    );
}
