import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAllNotebookItems } from '../actions';

// "Link to another note": choose the note or word a link points to (the
// editor's 🔗 menu, RichTextEditor.js). Searches every note and word in every
// notebook by title; the open notebook's come first.
//
//   Link to another note
//   [ 🔍 Search your notes and words      ]
//   📝 Spanish verbs                Spanish
//   Aa hablar                  Spanish +1
//                                 [Cancel]
//
// The lists come from fetchAllNotebookItems (the notebooks' own lists, which
// the iPhone app keeps for offline use).

const MAX_SHOWN = 60;

// For matching: no capitals, no accents ("como" finds "Cómo").
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(item: {type, id, title}) => void} props.onPick
 */
export default function NoteLinkPicker({ open, onClose, onPick }) {
    const dispatch = useDispatch();
    const currentWordbook = useSelector((state) => state.currentWordbook);
    const [items, setItems] = useState(null); // null: loading
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setQuery('');
        setError('');
        setItems(null);
        dispatch(fetchAllNotebookItems())
            .then((list) => { if (!cancelled) setItems(list); })
            .catch(() => { if (!cancelled) { setItems([]); setError('Couldn’t load your notes. Check your connection.'); } });
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => { cancelled = true; window.removeEventListener('keydown', onKey); };
    }, [open]);

    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    const shown = useMemo(() => {
        if (!items) return [];
        const q = fold(query.trim());
        const inHere = (item) => (currentWordbook && item.notebooks.includes(currentWordbook) ? 0 : 1);
        return items
            .filter((item) => !q || fold(item.title).includes(q))
            .sort((a, b) => inHere(a) - inHere(b)
                || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
            .slice(0, MAX_SHOWN);
    }, [items, query, currentWordbook]);

    if (!open) return null;

    // Where it is: the open notebook if it's there, else its first one.
    const whereLabel = (item) => {
        const first = currentWordbook && item.notebooks.includes(currentWordbook) ? currentWordbook : item.notebooks[0];
        const more = item.notebooks.length - 1;
        return more > 0 ? `${first} +${more}` : first;
    };

    return (
        <div className="cb-sheet__overlay" onMouseDown={onClose}>
            <div className="cb-sheet link-pick" role="dialog" aria-modal="true" aria-label="Link to another note"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <h3 className="cb-sheet__title">Link to another note</h3>
                <div className="link-pick__search">
                    <i className="search icon" aria-hidden="true"></i>
                    <input ref={inputRef} type="search" value={query} placeholder="Search your notes and words"
                        aria-label="Search your notes and words" onChange={(e) => setQuery(e.target.value)} />
                </div>
                {error && <div className="cb-sheet__error">{error}</div>}
                <div className="link-pick__list" role="listbox" aria-label="Notes and words">
                    {items === null ? (
                        <div className="link-pick__note">Loading your notes…</div>
                    ) : shown.length === 0 ? (
                        <div className="link-pick__note">{query.trim() ? 'Nothing matches.' : 'No notes yet.'}</div>
                    ) : shown.map((item) => (
                        <button type="button" key={`${item.type}:${item.id}`} role="option" aria-selected="false"
                            className="link-pick__row" onClick={() => onPick(item)}>
                            <span className={`link-pick__kind link-pick__kind--${item.type}`} aria-hidden="true">
                                {item.type === 'card' ? '📝' : 'Aa'}
                            </span>
                            <span className="link-pick__title">{item.title}</span>
                            <span className="link-pick__where">{whereLabel(item)}</span>
                        </button>
                    ))}
                </div>
                <div className="cb-sheet__actions">
                    <button type="button" className="cb-btn" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
