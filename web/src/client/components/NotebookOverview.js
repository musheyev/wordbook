import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { itemPath } from '../utils/notebookPaths';
import ReadAloud from './ReadAloud';

// A notebook's overview on desktop, shown when no item is open (the
// notebook name in the rail leads here). Every note and word as a card, in
// the notebook's own order:
//   note  its title and the start of its text
//   word  the word
// with the same icons as the phone list (NotebookItemList).
// A filter box matches titles as you type; All / Notes / Words narrows by
// type. Clicking a card opens the item. Phones show their own list instead
// (NotebookItemList), so this is hidden there (styles.css).
const TYPES = [
    { key: 'all', label: 'All' },
    { key: 'card', label: 'Notes' },
    { key: 'word', label: 'Words' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function NotebookOverview({ name, items, onAdd, getReadAloudChunks }) {
    const [query, setQuery] = useState('');
    const [type, setType] = useState('all');

    const notes = items.filter((item) => item.type === 'card').length;
    const words = items.length - notes;
    const q = query.trim().toLowerCase();
    const shown = items.filter((item) => (type === 'all' || item.type === type)
        && (!q || (item.title || '').toLowerCase().includes(q)));

    return (
        <div className="nb-overview">
            <div className="nb-overview__head">
                <div className="nb-overview__heading">
                    <h1 className="nb-overview__title">{name}</h1>
                    <div className="nb-overview__counts">
                        {[words ? plural(words, 'word') : null, notes ? plural(notes, 'note') : null]
                            .filter(Boolean).join(' · ')}
                    </div>
                </div>
                <div className="nb-overview__actions">
                    <button type="button" className="cb-btn cb-btn--accent" onClick={onAdd}>
                        <i className="plus icon" aria-hidden="true"></i>Add
                    </button>
                    <ReadAloud getChunks={getReadAloudChunks} title={name} label="Play all" />
                </div>
            </div>

            <div className="nb-overview__tools">
                <div className="nb-tools__search">
                    <i className="search icon" aria-hidden="true"></i>
                    <input type="search" placeholder="Filter this notebook…" aria-label="Filter this notebook"
                        value={query} onChange={(e) => setQuery(e.target.value)} />
                    {query && (
                        <button type="button" className="nb-tools__clear" aria-label="Clear filter"
                            onClick={() => setQuery('')}>×</button>
                    )}
                </div>
                {notes > 0 && words > 0 && (
                    <div className="nb-overview__types" role="group" aria-label="Show">
                        {TYPES.map((t) => (
                            <button key={t.key} type="button" aria-pressed={type === t.key}
                                className={`nb-overview__type${type === t.key ? ' is-on' : ''}`}
                                onClick={() => setType(t.key)}>{t.label}</button>
                        ))}
                    </div>
                )}
            </div>

            {shown.length === 0 ? (
                <div className="cb-empty">Nothing in this notebook matches “{query.trim()}”.</div>
            ) : (
                <ul className="nb-overview__grid">
                    {shown.map((item) => {
                        const isNote = item.type === 'card';
                        return (
                            <li key={`${item.type}:${item.id}`}>
                                <Link className={`nb-card${isNote ? ' nb-card--note' : ''}`} to={itemPath(name, item)}>
                                    <span className={`nb-card__icon nb-row__icon nb-row__icon--${isNote ? 'card' : 'word'}`}
                                        aria-hidden="true">
                                        <i className={`${isNote ? 'sticky note outline' : 'font'} icon`}></i>
                                    </span>
                                    <span className="nb-card__text">
                                        <span className="nb-card__title">{item.title}</span>
                                        {isNote && item.preview && <span className="nb-card__preview">{item.preview}</span>}
                                        {!isNote && <span className="nb-card__kind">Word</span>}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
