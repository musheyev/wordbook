import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import {
    fetchWordbooks, fetchWordbookPreviews,
    fetchWordbookUpdated, fetchNotebookSort, saveNotebookSort, reorderWordbooks, requestErrorMessage,
} from '../actions';
import NewNotebookButton from '../components/NewNotebookButton';
import WordbookItemConfig from '../components/WordbookItemConfig';
import SortableList from '../components/SortableList';
import requireAuth from '../components/hocs/requireAuth';
import Spinner from '../components/Spinner';
import LoadError from '../components/LoadError';
import DeviceDownloads from '../components/DeviceDownloads';
import DeleteAccount from '../components/DeleteAccount';

// My Notebooks, and My Wordbooks (`kind="wordbook"`, /wordbooks): the same
// page, each listing only its own kind (state.wordbookKinds; see api
// wordbook.js). Wordbooks and notebooks hold and show the same things; the
// kind only decides which of the two pages lists them. Downloads and the
// Account section are on My Notebooks only. (The Inbox is in the side panel
// and the phone's tab bar, so this page doesn't repeat it.)
//
// Above the list: a search box (filters by name as you type)
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

// Words for each page.
const TEXT = {
    notebook: {
        title: 'My Notebooks', one: 'notebook', many: 'notebooks', Many: 'Notebooks',
        empty: 'No notebooks yet — create one above to start collecting words and notes.',
    },
    wordbook: {
        title: 'My Wordbooks', one: 'wordbook', many: 'wordbooks', Many: 'Wordbooks',
        empty: 'No wordbooks yet — create one above to start collecting words.',
    },
};

/**
 * In My order, a page shows only its own kind, but the order saved is one
 * list of every notebook. Put the dragged page's new order back into the
 * full list: its notebooks take the same places, in their new order, and
 * the other kind's stay where they were.
 *
 * @param {string[]} all every notebook, in the saved order
 * @param {string[]} reordered this page's notebooks, in the new order
 * @returns {string[]}
 */
function mergeOrder(all, reordered) {
    const mine = new Set(reordered);
    let next = 0;
    return all.map((name) => (mine.has(name) ? reordered[next++] : name));
}

function AccountPage({
    kind = 'notebook',
    wordbooks, wordbookKinds, notebookSort, wordbookUpdated,
    fetchWordbooks, fetchWordbookPreviews,
    fetchWordbookUpdated, fetchNotebookSort, saveNotebookSort, reorderWordbooks,
}) {
    const [query, setQuery] = useState('');
    const [sortOpen, setSortOpen] = useState(false);
    // The list in the store may be empty only because it hasn't arrived yet;
    // until it has, show a spinner rather than "No notebooks yet". A list
    // already in the store (from an earlier visit) shows at once while it
    // refreshes.
    const [listLoaded, setListLoaded] = useState(() => Array.isArray(wordbooks) && wordbooks.length > 0);
    const [loadError, setLoadError] = useState(null);

    const loadList = () => {
        setLoadError(null);
        Promise.resolve(fetchWordbooks())
            .then(() => setListLoaded(true))
            .catch((err) => setLoadError(requestErrorMessage(err, `Couldn't load your ${text.many}. Try again.`)));
    };

    const text = TEXT[kind];
    const isNotebooks = kind === 'notebook';
    // This page's own kind only; nothing until kinds have loaded, so a
    // wordbook never flashes up on My Notebooks.
    const allNames = Array.isArray(wordbooks) ? wordbooks : null;
    const names = allNames && wordbookKinds
        ? allNames.filter((name) => (wordbookKinds[name] === 'wordbook') === !isNotebooks)
        : null;
    const namesKey = allNames ? allNames.join('\u0000') : '';

    useEffect(() => {
        loadList();
        fetchWordbookPreviews();
        fetchNotebookSort();
    }, [fetchWordbooks, fetchWordbookPreviews, fetchNotebookSort]);

    // Updated times and kinds: on arrival, and again when notebooks are
    // added, deleted or renamed, so every card has one.
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
    const ready = listLoaded && names !== null;
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

    const onReorder = (reordered) => reorderWordbooks(mergeOrder(allNames || [], reordered));

    const pickSort = (key) => {
        setSortOpen(false);
        if (key !== sort) saveNotebookSort(key);
    };

    return (
        <div className="cb-account">
            {/* + New (top right) opens a small window to name the notebook. */}
            <div className="cb-account__head">
                <h1 className="cb-page-title">{text.title}</h1>
                <NewNotebookButton kind={kind} />
            </div>



            {ready && hasBooks && (
                <div className="nb-tools">
                    <div className="nb-tools__search">
                        <i className="search icon" aria-hidden="true"></i>
                        <input type="search" placeholder={`Search ${text.many}`} aria-label={`Search ${text.many}`}
                            value={query} onChange={(e) => setQuery(e.target.value)} />
                        {query && (
                            <button type="button" className="nb-tools__clear" aria-label="Clear search"
                                onClick={() => setQuery('')}>×</button>
                        )}
                    </div>
                    <button type="button" className="nb-tools__sort" onClick={() => setSortOpen(true)}
                        aria-haspopup="dialog" title={`Sort ${text.many}`}>
                        <i className="sort icon" aria-hidden="true"></i>
                        {sortInfo.label}
                    </button>
                </div>
            )}

            {!listLoaded && loadError && <LoadError message={loadError} onRetry={loadList} />}
            {((!ready && !loadError) || (ready && hasBooks && !sort)) && <Spinner label={`Loading ${text.many}…`} />}

            {ready && hasBooks && sort && (
                shown.length === 0 ? (
                    <div className="cb-empty">No {text.many} match “{query.trim()}”.</div>
                ) : draggable ? (
                    <SortableList items={shown} getKey={(name) => name} grid className="cb-grid"
                        onReorder={onReorder}
                        renderItem={(name, handleProps) => card(name, handleProps)} />
                ) : (
                    <div className="cb-grid">
                        {shown.map((name) => card(name))}
                    </div>
                )
            )}

            {ready && names.length === 0 && (
                <div className="cb-empty">{text.empty}</div>
            )}

            {/* iPhone app: what's downloaded, and Remove all downloads. */}
            {isNotebooks && <DeviceDownloads />}

            {/* Who's signed in, and Delete account. */}
            {isNotebooks && <DeleteAccount />}

            {sortOpen && (
                <div className="cb-sheet__overlay" onMouseDown={() => setSortOpen(false)}>
                    <div className="cb-sheet sort-sheet" role="dialog" aria-modal="true" aria-label={`Sort ${text.many}`}
                        onMouseDown={(e) => e.stopPropagation()}>
                        <div className="cb-sheet__grab" aria-hidden="true" />
                        <h3 className="cb-sheet__title">Sort {text.many}</h3>
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

function mapStatetoProps({ wordbooks, wordbookKinds, notebookSort, wordbookUpdated }) {
    return { wordbooks, wordbookKinds, notebookSort, wordbookUpdated };
}

export default connect(mapStatetoProps, {
    fetchWordbooks, fetchWordbookPreviews,
    fetchWordbookUpdated, fetchNotebookSort, saveNotebookSort, reorderWordbooks,
})(requireAuth(AccountPage));
