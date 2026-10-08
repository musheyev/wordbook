import React from 'react';
import { SEARCH_MODES, WHERE_LABEL } from '../utils/useNotebookSearch';

// The search box and its mode (Titles / Everything / Everything +
// definitions) above a notebook's items: the desktop overview and the phone
// list. State comes from useNotebookSearch.
export default function NotebookSearchBar({ search, className = '' }) {
    const { query, setQuery, mode, setMode } = search;
    return (
        <div className={`nb-search ${className}`}>
            <div className="nb-tools__search">
                <i className="search icon" aria-hidden="true"></i>
                <input type="search" aria-label="Search this notebook"
                    placeholder={mode === 'titles' ? 'Filter this notebook…' : 'Search this notebook…'}
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

// Status under the box: too short, searching…, failed, or no matches.
export function NotebookSearchStatus({ search }) {
    const { searching, textSearch, tooShort, loading, error, results, query } = search;
    if (!searching) return null;
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
