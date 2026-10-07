import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import {
    fetchWordbooks, fetchWordbookPreviews, fetchInbox,
    fetchWordbookUpdated, fetchNotebookSort, saveNotebookSort, reorderWordbooks,
} from '../actions';
import AddWordbook from '../components/AddWordbook';
import WordbookItemConfig from '../components/WordbookItemConfig';
import SortableList from '../components/SortableList';
import requireAuth from '../components/hocs/requireAuth';
import Spinner from '../components/Spinner';

// My Notebooks. Above the list: a search box (filters by name as you type)
// and the sort button, which opens a sheet with three choices:
//   az       A–Z
//   updated  Recently updated: a note added or edited most recently first;
//            each card shows how long ago
//   custom   My order: cards get a grip and can be dragged; the order is
//            saved (wordbook sort_order on the server)
// The choice is saved on the account, so every device opens with the last
// one used. While searching, My order can't be dragged: moving a card within
// a filtered list would be ambiguous about where it lands in the full one.
const SORTS = [
    { key: 'az', label: 'A–Z', menu: 'A–Z' },
    { key: 'updated', label: 'Recent', menu: 'Recently updated' },
    { key: 'custom', label: 'My order', menu: 'My order (drag to arrange)' },
];

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

function sortNotebooks(names, sort, updated) {
    if (sort === 'az') return [...names].sort(byName);
    if (sort === 'updated') {
        // Newest first; notebooks with no time at all go last, A–Z.
        return [...names].sort((a, b) => {
            const ta = updated[a] || '';
            const tb = updated[b] || '';
            if (ta !== tb) return ta < tb ? 1 : -1;
            return byName(a, b);
        });
    }
    return names; // custom: the server returns them in the user's order
}

function AccountPage({
    wordbooks, inbox, notebookSort, wordbookUpdated,
    fetchWordbooks, fetchWordbookPreviews, fetchInbox,
    fetchWordbookUpdated, fetchNotebookSort, saveNotebookSort, reorderWordbooks,
}) {
    const [query, setQuery] = useState('');
    const [sortOpen, setSortOpen] = useState(false);
    // The list in the store may be empty only because it hasn't arrived yet;
    // until it has, show a spinner rather than "No notebooks yet".
    const [listLoaded, setListLoaded] = useState(false);

    const names = Array.isArray(wordbooks) ? wordbooks : null;
    const namesKey = names ? names.join('\u0000') : '';

    useEffect(() => {
        Promise.resolve(fetchWordbooks()).catch(() => {}).then(() => setListLoaded(true));
        fetchWordbookPreviews();
        fetchInbox();
        fetchNotebookSort();
    }, [fetchWordbooks, fetchWordbookPreviews, fetchInbox, fetchNotebookSort]);

    // Updated times: on arrival, and again when notebooks are added, deleted
    // or renamed, so every card has one.
    useEffect(() => {
        fetchWordbookUpdated();
    }, [namesKey, fetchWordbookUpdated]);

    useEffect(() => {
        if (!sortOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setSortOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [sortOpen]);

    const hasBooks = names && names.length > 0;
    const inboxCount = Array.isArray(inbox) ? inbox.length : 0;
    const sort = notebookSort; // null until the saved choice has loaded
    const sortInfo = SORTS.find((s) => s.key === sort) || SORTS[0];

    const q = query.trim().toLowerCase();
    const shown = hasBooks && sort
        ? sortNotebooks(names, sort, wordbookUpdated || {}).filter((name) => !q || name.toLowerCase().includes(q))
        : [];
    const draggable = sort === 'custom' && !q;

    const card = (name, handleProps) => (
        <WordbookItemConfig key={name} name={name} handleProps={handleProps}
            updated={sort === 'updated' ? (wordbookUpdated || {})[name] : undefined} />
    );

    const pickSort = (key) => {
        setSortOpen(false);
        if (key !== sort) saveNotebookSort(key);
    };

    return (
        <div className="cb-account">
            <div className="cb-account__head">
                <h1 className="cb-page-title">My Notebooks</h1>
            </div>

            {/* The Inbox is pinned above the notebooks. It isn't a notebook
                (it lives in its own table; see api/inbox.js), so it can't be
                renamed, deleted or reordered. */}
            <Link to="/inbox" className="inbox-card">
                <span className="inbox-card__icon" aria-hidden="true">
                    <i className="inbox icon"></i>
                </span>
                <span className="inbox-card__text">
                    <span className="inbox-card__title">Inbox</span>
                    <span className="inbox-card__sub">
                        {inboxCount === 0 ? 'Words and notes shared with you'
                            : `${inboxCount} shared with you`}
                    </span>
                </span>
                {inboxCount > 0 && <span className="inbox-badge">{inboxCount}</span>}
                <i className="chevron right icon inbox-card__chev" aria-hidden="true"></i>
            </Link>

            <AddWordbook />

            {listLoaded && hasBooks && (
                <div className="nb-tools">
                    <div className="nb-tools__search">
                        <i className="search icon" aria-hidden="true"></i>
                        <input type="search" placeholder="Search notebooks" aria-label="Search notebooks"
                            value={query} onChange={(e) => setQuery(e.target.value)} />
                        {query && (
                            <button type="button" className="nb-tools__clear" aria-label="Clear search"
                                onClick={() => setQuery('')}>×</button>
                        )}
                    </div>
                    <button type="button" className="nb-tools__sort" onClick={() => setSortOpen(true)}
                        aria-haspopup="dialog" title="Sort notebooks">
                        <i className="sort icon" aria-hidden="true"></i>
                        {sortInfo.label}
                    </button>
                </div>
            )}

            {(!listLoaded || (hasBooks && !sort)) && <Spinner label="Loading notebooks…" />}

            {listLoaded && hasBooks && sort && (
                shown.length === 0 ? (
                    <div className="cb-empty">No notebooks match “{query.trim()}”.</div>
                ) : draggable ? (
                    <SortableList items={shown} getKey={(name) => name} grid className="cb-grid"
                        onReorder={reorderWordbooks}
                        renderItem={(name, handleProps) => card(name, handleProps)} />
                ) : (
                    <div className="cb-grid">
                        {shown.map((name) => card(name))}
                    </div>
                )
            )}

            {listLoaded && names && names.length === 0 && (
                <div className="cb-empty">
                    No notebooks yet — create one above to start collecting words and notes.
                </div>
            )}

            {sortOpen && (
                <div className="cb-sheet__overlay" onMouseDown={() => setSortOpen(false)}>
                    <div className="cb-sheet sort-sheet" role="dialog" aria-modal="true" aria-label="Sort notebooks"
                        onMouseDown={(e) => e.stopPropagation()}>
                        <div className="cb-sheet__grab" aria-hidden="true" />
                        <h3 className="cb-sheet__title">Sort notebooks</h3>
                        {SORTS.map((s) => (
                            <button key={s.key} type="button" className="sort-sheet__option"
                                aria-pressed={s.key === sort} onClick={() => pickSort(s.key)} autoFocus={s.key === sort}>
                                <span className="sort-sheet__check" aria-hidden="true">{s.key === sort ? '✓' : ''}</span>
                                {s.menu}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function mapStatetoProps({ wordbooks, inbox, notebookSort, wordbookUpdated }) {
    return { wordbooks, inbox, notebookSort, wordbookUpdated };
}

export default connect(mapStatetoProps, {
    fetchWordbooks, fetchWordbookPreviews, fetchInbox,
    fetchWordbookUpdated, fetchNotebookSort, saveNotebookSort, reorderWordbooks,
})(requireAuth(AccountPage));
