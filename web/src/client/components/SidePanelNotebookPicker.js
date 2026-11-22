import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchWordbookUpdated } from '../actions';
import { listPathFor } from '../utils/notebookPaths';

// The menu that drops from the notebook's name in the side panel (Header.js):
// your notebooks, most recently changed first, to look through another one's
// notes there without leaving the note on the page (BrowseNotebookList). The
// page's own notebook is first and marked; picking it goes back to it.
// "All notebooks…" opens My Notebooks.
//
// The names and dates come from the store (fetchWordbookUpdated, the same as
// My Notebooks), loaded here if they aren't yet.

/**
 * @param {object} props
 * @param {string} props.current the page's notebook
 * @param {string} props.shown the notebook the side panel shows now
 * @param {(name: string) => void} props.onPick
 * @param {() => void} props.onClose
 */
export default function SidePanelNotebookPicker({ current, shown, onPick, onClose }) {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const updated = useSelector((state) => state.wordbookUpdated);
    const kinds = useSelector((state) => state.wordbookKinds);

    useEffect(() => { if (kinds === null) dispatch(fetchWordbookUpdated()); }, [kinds, dispatch]);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const others = Object.keys(kinds || {})
        .filter((name) => name !== current && kinds[name] !== 'wordbook')
        .sort((a, b) => String((updated || {})[b] || '').localeCompare(String((updated || {})[a] || '')));

    return (
        <>
            <div className="cb-menu__backdrop" onMouseDown={onClose} />
            <div className="cb-menu__list nav-pick" role="menu" aria-label="Show another notebook's notes">
                <button type="button" role="menuitemradio" aria-checked={shown === current}
                    className={`nav-pick__item${shown === current ? ' is-on' : ''}`} onClick={() => onPick(current)}>
                    <span className="nav-pick__name">{current}</span>
                    <span className="nav-pick__note">this page</span>
                </button>
                <hr className="nb-menu__sep" />
                {kinds === null ? (
                    <div className="nav-pick__msg">Loading…</div>
                ) : others.length === 0 ? (
                    <div className="nav-pick__msg">No other notebooks yet.</div>
                ) : (
                    <div className="nav-pick__scroll">
                        {others.map((name) => (
                            <button type="button" key={name} role="menuitemradio" aria-checked={shown === name}
                                className={`nav-pick__item${shown === name ? ' is-on' : ''}`} onClick={() => onPick(name)}>
                                <span className="nav-pick__name">{name}</span>
                            </button>
                        ))}
                    </div>
                )}
                <hr className="nb-menu__sep" />
                <button type="button" role="menuitem" className="nav-pick__all"
                    onClick={() => { onClose(); navigate(listPathFor(current, kinds)); }}>
                    All notebooks…
                </button>
            </div>
        </>
    );
}
