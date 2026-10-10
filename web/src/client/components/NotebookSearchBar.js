import React from 'react';
import { SEARCH_MODES, WHERE_LABEL } from '../utils/useNotebookSearch';
import { ITEM_SORTS, tagCounts } from '../utils/itemSort';

const PLACEHOLDER = { titles: 'Filter this notebook…', tag: 'Filter by tag…' };

// The search box and its mode (Titles / Tag / Everything / Everything +
// definitions) above a notebook's items: the desktop overview and the phone
// list. State comes from useNotebookSearch.
export default function NotebookSearchBar({ search, className = '' }) {
    const { query, setQuery, mode, setMode } = search;
    return (
        <div className={`nb-search ${className}`}>
            <div className="nb-tools__search">
                <i className="search icon" aria-hidden="true"></i>
                <input type="search" aria-label="Search this notebook"
                    placeholder={PLACEHOLDER[mode] || 'Search this notebook…'}
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                {query && (
                    <button type="button" className="nb-tools__clear" aria-label="Clear search"
                        onClick={() => setQuery('')}>×</button>
                )}
            </div>
            <select className="nb-search__mode" aria-label="Search in" value={mode}
                onChange={(e) => setMode(e.target.value)}>
                {SEARCH_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
        </div>
    );
}

// In Tag mode: this notebook's tags with how many items have each, narrowed
// to what's typed; tapping one shows just its items (tapping it again shows
// all of them).
export function TagPicker({ search, items }) {
    if (search.mode !== 'tag') return null;
    const all = tagCounts(items);
    if (!all.length) {
        return <div className="nb-tagpick nb-tagpick--empty">No tags in this notebook yet. Add tags on a note’s or word’s page.</div>;
    }
    const q = search.query.trim().toLowerCase();
    const exact = all.some(({ tag }) => tag.toLowerCase() === q);
    const shown = q && !exact ? all.filter(({ tag }) => tag.toLowerCase().includes(q)) : all;
    return (
        <div className="nb-tagpick" role="group" aria-label="Tags in this notebook">
            {shown.map(({ tag, count }) => {
                const on = tag.toLowerCase() === q;
                return (
                    <button type="button" key={tag} aria-pressed={on} className={`nb-tag${on ? ' is-on' : ''}`}
                        onClick={() => search.setQuery(on ? '' : tag)}>
                        {tag} <span className="nb-tag__count">{count}</span>
                    </button>
                );
            })}
        </div>
    );
}

// How the items are sorted (utils/itemSort.js), one choice per notebook.
export function SortSelect({ sort, onChange, className = '' }) {
    return (
        <label className={`nb-sort ${className}`}>
            <span className="nb-sort__label">Sort</span>
            <select aria-label="Sort" value={sort} onChange={(e) => onChange(e.target.value)}>
                {ITEM_SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
        </label>
    );
}

// Status under the box: too short, searching…, failed, or no matches.
export function NotebookSearchStatus({ search }) {
    const { searching, textSearch, tooShort, loading, error, results, query, mode } = search;
    if (!searching) return null;
    if (mode === 'tag') {
        return results.length ? null : <div className="nb-search__status">Nothing here is tagged “{query.trim()}”.</div>;
    }
    if (tooShort) return <div className="nb-search__status">Type at least 2 letters.</div>;
    if (error) return <div className="nb-search__status nb-search__status--error">{error}</div>;
    if (textSearch && loading) return <div className="nb-search__status">Searching…</div>;
    if (results.length === 0) return <div className="nb-search__status">Nothing in this notebook matches “{query.trim()}”.</div>;
    return null;
}

// The passage around a match, with the match highlighted, and where it was.
export function MatchSnippet({ snippet, where }) {
    if (!snippet) return null;
    return (
        <span className="nb-snippet">
            <span className="nb-snippet__text">
                {snippet.before}<mark>{snippet.match}</mark>{snippet.after}
            </span>
            {where && <span className="nb-snippet__where">{WHERE_LABEL[where] || ''}</span>}
        </span>
    );
}
