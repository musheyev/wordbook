import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRecentNotes } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import { noteLinkHref } from '../utils/noteLinks';
import { timeAgo } from '../utils/timeAgo';

/**
 * The clock button above an open note (WordbookPage's back bar): a short
 * list of the notes and words you opened most recently, on any device, to go
 * back to one. The list lives on the account (api/recent-notes.js); it's
 * asked for each time the button opens, so it's always current.
 *
 * Each row opens the item in the notebook it was opened in. If that notebook
 * is gone (renamed or deleted since), the row opens it by its note link
 * (/note/<type>/<id>, NoteLinkPage), which finds a notebook it's in.
 * Opening one adds a step to the browser's history (not `replace`), so Back
 * returns to the note you were on.
 *
 * @param {string} current the open item's key, "<type>:<id>", left out of
 *   the list (it's always the newest)
 */
export default function RecentNotesButton({ current }) {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const kinds = useSelector((state) => state.wordbookKinds);
    const [open, setOpen] = useState(false);
    const [list, setList] = useState(null); // null while loading
    const [failed, setFailed] = useState(false);

    // Load each time it opens.
    useEffect(() => {
        if (!open) return undefined;
        let live = true;
        setList(null);
        setFailed(false);
        dispatch(fetchRecentNotes())
            .then((items) => { if (live) setList(items); })
            .catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, [open, dispatch]);

    // Escape closes it.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const shown = (list || []).filter((r) => `${r.type}:${r.id}` !== current);

    const go = (r) => {
        setOpen(false);
        // Kinds not loaded yet: assume the notebook is still there.
        const notebookExists = !kinds || r.wordbook in kinds;
        navigate(notebookExists ? itemPath(r.wordbook, r) : noteLinkHref(r.type, r.id));
    };

    return (
        <span className="recent-notes">
            <button type="button" className={`nb-back__step${open ? ' on' : ''}`} title="Recent notes"
                aria-label="Recent notes" aria-haspopup="menu" aria-expanded={open}
                onClick={() => setOpen((v) => !v)}>
                <i className="clock outline icon"></i>
            </button>
            {open && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="cb-menu__list recent-notes__list" role="menu" aria-label="Recent notes">
                        <div className="recent-notes__head">Recent notes</div>
                        {failed ? (
                            <div className="recent-notes__msg">Couldn’t load your recent notes. Check your connection and try again.</div>
                        ) : list === null ? (
                            <div className="recent-notes__msg">Loading…</div>
                        ) : shown.length === 0 ? (
                            <div className="recent-notes__msg">Notes you open will show up here.</div>
                        ) : shown.map((r) => (
                            <button key={`${r.type}:${r.id}`} type="button" role="menuitem" onClick={() => go(r)}>
                                <i className={`${r.type === 'card' ? 'sticky note outline' : 'font'} icon`} aria-hidden="true"></i>
                                <span className="recent-notes__text">
                                    <span className="recent-notes__title">{r.title}</span>
                                    <span className="recent-notes__sub">{r.wordbook} · {timeAgo(r.at)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </span>
    );
}
