import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import NotebookMenu from './NotebookMenu';
import GripIcon from './GripIcon';
import ReadAloud from './ReadAloud';
import ItemColorButton from './ItemColorButton';
import { DownloadSelectedButton } from './DownloadButtons';
import { TagPicker, NotebookSearchStatus } from './NotebookSearchBar';
import { SEARCH_MODES } from '../utils/useNotebookSearch';
import { ITEM_SORTS } from '../utils/itemSort';

// The top of a notebook on phones (WordbookPage), above its list
// (NotebookItemList):
//
//   (‹)  News ⌄                        (⋯)    stays at the top while scrolling
//   [🔍 Search 5 notes        Titles ⌄ ]
//   [▶ Play all ⌄] [+ Add] [☑ Select]
//   5 notes                     ⇅ My order ⌄
//
// - ‹ is a round 44-point button (an easy target for a finger), apart from
//   the name, which opens the notebook's menu as before.
// - What to search in (Titles / Tag / Everything / + definitions) is chosen
//   inside the search box, so nothing else moves while searching: Play and
//   Select then work on the matches ("Play 2"), and the sort stays.
// - ⋯ opens the same menu as the name, with Reorder and Quiz (admins) first.
// - Select: the buttons become Play, Quiz, Color, Download for the ticked
//   items, the line below says how many and offers Select all / none, and
//   Cancel takes the ⋯'s place. The name stays.
// - Reorder (from ⋯, in My order): the rows get their drag grips, the
//   search and buttons step aside, and Done ends it.
// - Scrolled down, the search box and buttons scroll away with the page;
//   a 🔍 then appears beside ⋯ and brings them back.
//
// Nothing here is new behaviour; it's the same controls as before, arranged
// so the list starts higher (see design/mobile-notebook-header/).

/** "5 items · 3 notes, 2 words", "4 notes", "1 word". */
export function itemCountLabel(items) {
    const notes = items.filter((item) => item.type === 'card').length;
    const words = items.length - notes;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    if (!words) return plural(notes, 'note', 'notes');
    if (!notes) return plural(words, 'word', 'words');
    return `${plural(items.length, 'item', 'items')} · ${plural(notes, 'note', 'notes')}, ${plural(words, 'word', 'words')}`;
}

/** "notes", "words" or "items", for "Search 5 notes" and "2 of 5 notes". */
const nounFor = (items) => {
    const notes = items.filter((item) => item.type === 'card').length;
    if (notes === items.length) return items.length === 1 ? 'note' : 'notes';
    if (notes === 0) return items.length === 1 ? 'word' : 'words';
    return items.length === 1 ? 'item' : 'items';
};

// The search box, with what to search in inside it (a native picker: the
// phone's own list of choices).
function SearchBox({ search, items, boxRef, inputRef }) {
    const { query, setQuery, mode, setMode } = search;
    const placeholder = mode === 'tag' ? 'Filter by tag…'
        : mode === 'titles' ? `Search ${items.length} ${nounFor(items)}` : 'Search everything…';
    return (
        <div className={`pnb__search${query ? ' is-live' : ''}`} ref={boxRef}>
            <i className="search icon" aria-hidden="true"></i>
            <input ref={inputRef} type="search" aria-label="Search this notebook" placeholder={placeholder}
                value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="pnb__mode">
                <span className="pnb__mode-text">{(SEARCH_MODES.find((m) => m.key === mode) || {}).label}</span>
                <i className="chevron down icon" aria-hidden="true"></i>
                <select aria-label="Search in" value={mode} onChange={(e) => setMode(e.target.value)}>
                    {SEARCH_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
            </label>
            {query && (
                <button type="button" className="pnb__clear" aria-label="Clear search" onClick={() => setQuery('')}>
                    <i className="times icon" aria-hidden="true"></i>
                </button>
            )}
        </div>
    );
}

// The sort, as a line of text that opens the phone's own picker.
function SortPicker({ sort, onSort }) {
    const label = (ITEM_SORTS.find((o) => o.key === sort) || ITEM_SORTS[0]).label;
    return (
        <label className="pnb__sort">
            <i className="sort icon" aria-hidden="true"></i>
            <span>{label}</span>
            <i className="chevron down icon" aria-hidden="true"></i>
            <select aria-label="Sort" value={sort} onChange={(e) => onSort(e.target.value)}>
                {ITEM_SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
        </label>
    );
}

/**
 * @param {object} props
 * @param {string} props.name the notebook
 * @param {string} props.backPath where ‹ goes (My Notebooks or My Wordbooks)
 * @param {string} props.backLabel
 * @param {Array} props.items the notebook's items (sorted)
 * @param {Array} props.shownItems what the search shows (all items when none)
 * @param {object} props.search useNotebookSearch
 * @param {string} props.sort
 * @param {(sort: string) => void} props.onSort
 * @param {object} props.selection WordbookPage's selection (NotebookSelect.js)
 * @param {Array} props.pickedItems the ticked items
 * @param {{on: boolean, start: () => void, stop: () => void}} props.reorder
 * @param {boolean} props.isAdmin
 * @param {() => void} props.onAdd
 * @param {(list: Array) => void} props.onQuiz
 * @param {(list: Array) => Promise<Array>} props.getChunks the read-aloud queue for a list
 */
export default function PhoneNotebookBar({
    name, backPath, backLabel, items, shownItems, search, sort, onSort, selection, pickedItems, reorder,
    isAdmin, onAdd, onQuiz, getChunks,
}) {
    const boxRef = useRef(null);
    const inputRef = useRef(null);
    const [boxGone, setBoxGone] = useState(false);
    const ticking = selection.selecting;
    const has = items.length > 0;

    // Whether the search box has scrolled out of sight (then 🔍 shows).
    useEffect(() => {
        const el = boxRef.current;
        if (!el || !window.IntersectionObserver) return undefined;
        const seen = new IntersectionObserver(([entry]) => setBoxGone(!entry.isIntersecting), { threshold: 0 });
        seen.observe(el);
        return () => seen.disconnect();
    }, [reorder.on, has]);
    const backToSearch = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => inputRef.current && inputRef.current.focus({ preventScroll: true }), 350);
    };

    const n = selection.picked.size;
    const allPicked = shownItems.length > 0 && shownItems.every((item) => selection.isPicked(item));

    const extraItems = [
        {
            key: 'reorder', icon: 'bars', label: 'Reorder',
            disabled: !has || sort !== 'custom',
            note: has && sort !== 'custom' ? 'Sort by My order first' : undefined,
            onClick: reorder.start,
        },
        ...(isAdmin && has ? [{ key: 'quiz', icon: 'question circle outline', label: 'Quiz', onClick: () => onQuiz(shownItems) }] : []),
    ];

    let right = null;
    if (reorder.on) {
        right = <button type="button" className="pnb__text-btn" onClick={reorder.stop}>Done</button>;
    } else if (ticking) {
        right = <button type="button" className="pnb__text-btn" onClick={selection.cancel}>Cancel</button>;
    }

    return (
        <div className={`pnb${reorder.on ? ' pnb--reorder' : ''}${ticking ? ' pnb--selecting' : ''}${boxGone && !reorder.on ? ' pnb--scrolled' : ''}`}>
            <div className="pnb__nav">
                <Link className="pnb__round pnb__back" to={backPath} aria-label={backLabel} title={backLabel}>
                    <i className="chevron left icon" aria-hidden="true"></i>
                </Link>
                <NotebookMenu name={name} className="pnb__menu" moreButton={!right} extraItems={extraItems}>
                    {boxGone && has && !reorder.on && (
                        <button type="button" className="pnb__round" aria-label="Search this notebook" title="Search"
                            onClick={backToSearch}>
                            <i className="search icon" aria-hidden="true"></i>
                        </button>
                    )}
                </NotebookMenu>
                {right}
            </div>

            {reorder.on ? (
                <div className="pnb__hint">Drag <GripIcon size={14} /> to move a note up or down.</div>
            ) : (
                <>
                    {has && <SearchBox search={search} items={items} boxRef={boxRef} inputRef={inputRef} />}
                    {has && <div className="pnb__tags"><TagPicker search={search} items={items} /></div>}

                    {ticking ? (
                        <div className="pnb__buttons" role="toolbar" aria-label="Selected items">
                            {n > 0 ? (
                                <ReadAloud getChunks={() => getChunks(pickedItems)} title={name} label="Play" voices={false} />
                            ) : (
                                <button type="button" className="cb-btn cb-btn--ghost" disabled>
                                    <i className="volume up icon" aria-hidden="true"></i>Play
                                </button>
                            )}
                            {isAdmin && (
                                <button type="button" className="cb-btn cb-btn--ghost" disabled={n === 0}
                                    onClick={() => onQuiz(pickedItems)}>
                                    <i className="question circle outline icon" aria-hidden="true"></i>Quiz
                                </button>
                            )}
                            <ItemColorButton items={pickedItems} />
                            {n > 0 && <DownloadSelectedButton notebook={name} items={pickedItems} />}
                        </div>
                    ) : (
                        <div className="pnb__buttons">
                            {has && (search.searching && shownItems.length === 0 ? (
                                <button type="button" className="cb-btn cb-btn--ghost pnb__play" disabled>
                                    <i className="volume up icon" aria-hidden="true"></i>Play
                                </button>
                            ) : (
                                <span className="pnb__play">
                                    <ReadAloud getChunks={() => getChunks(shownItems)} title={name} firstSentence
                                        label={search.searching ? `Play ${shownItems.length}` : 'Play all'} />
                                </span>
                            ))}
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={onAdd}>
                                <i className="plus icon" aria-hidden="true"></i>Add
                            </button>
                            {has && (
                                <button type="button" className="cb-btn cb-btn--ghost" onClick={selection.start}>
                                    <i className="check square outline icon" aria-hidden="true"></i>Select
                                </button>
                            )}
                        </div>
                    )}

                    {has && (ticking ? (
                        <div className="pnb__line">
                            <b>{n} of {shownItems.length} selected</b>
                            <span className="pnb__spacer" />
                            <button type="button" className="pnb__link" disabled={allPicked}
                                onClick={() => selection.setAll(shownItems)}>Select all</button>
                            <button type="button" className="pnb__link" disabled={n === 0}
                                onClick={() => selection.setAll([])}>Select none</button>
                        </div>
                    ) : (
                        <div className="pnb__line">
                            <span>
                                {search.searching
                                    ? `${shownItems.length} of ${items.length} ${nounFor(items)}`
                                    : itemCountLabel(items)}
                            </span>
                            <span className="pnb__spacer" />
                            <SortPicker sort={sort} onSort={onSort} />
                        </div>
                    ))}
                    <NotebookSearchStatus search={search} />
                </>
            )}
        </div>
    );
}
