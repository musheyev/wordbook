import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { reorderWordbookItems, openNoteWindow, toggleNoteWindowMode } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import { inPlainView } from '../utils/lastVisited';
import { tagGroups, colorGroups } from '../utils/itemSort';
import { colorOf } from '../utils/itemColors';
import ItemColorButton from './ItemColorButton';
import ReadAloud from './ReadAloud';
import SortableList from './SortableList';
import GripIcon from './GripIcon';
import NotebookSearchBar, {
    NotebookSearchStatus, MatchSnippet, TagPicker, SortSelect,
} from './NotebookSearchBar';
import { SelectBar, SelectCheck } from './NotebookSelect';
import CopyNotesButton from './CopyNotesButton';
import NotebookMenu from './NotebookMenu';
import { ItemBadge, MissingLine } from './DownloadBadge';
import { DownloadSelectedButton } from './DownloadButtons';

// A notebook's overview on desktop, shown when no item is open (the
// notebook name in the rail leads here). Every note and word as a card:
//   note  its title, the start of its text, and its tags
//   word  the word and its tags
// with the same icons as the phone list (NotebookItemList).
//
// Sort (one choice per notebook, utils/itemSort.js): `items` comes sorted.
// In My order the cards can be dragged by their grip (⋮⋮); By tag shows a
// heading per tag. The search box filters by title or tag, or searches
// everything in the notebook (`search`, WordbookPage's useNotebookSearch);
// text matches show the passage that matched. Clicking a tag on a card
// filters by it. All / Notes / Words narrows by type. Play all reads what's
// shown, in this order. The note last opened in this notebook (this session,
// `lastKey`) is highlighted and scrolled into view when you come back.
// A note's or word's colour tints its card; the dot at a card's top right
// (on hover) sets it without opening the card. By color groups by colour.
// Select ticks cards (clicking a card ticks it instead
// of opening it) for Play selected (`selection`, NotebookSelect.js). Admins
// also get Copy (what's shown) and Copy selected (CopyNotesButton). Clicking a card opens the item, at the match when it
// was found in the text. Phones show their own list instead
// (NotebookItemList), so this is hidden there (styles.css).
const TYPES = [
    { key: 'all', label: 'All' },
    { key: 'card', label: 'Notes' },
    { key: 'word', label: 'Words' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const keyOf = (item) => `${item.type}:${item.id}`;

export default function NotebookOverview({
    name, items, search, sort, onSort, selection, playSelected, onAdd, getReadAloudChunks, lastKey, colors, missing,
}) {
    const dispatch = useDispatch();
    const rootRef = useRef(null);
    // Coming back: bring the last-opened card into view.
    useEffect(() => {
        // A moment later: going Back, the browser first puts the page back
        // where it was, which would undo this.
        const timer = setTimeout(() => {
            const el = rootRef.current && rootRef.current.querySelector('.nb-card.is-last');
            if (el && !inPlainView(el)) el.scrollIntoView({ block: 'center' });
        }, 120);
        return () => clearTimeout(timer);
    }, [name, lastKey]);
    const isAdmin = useSelector((state) => state.isAdmin);
    // "Open notes in windows" (the rail's ▭): a note's card opens a window.
    const noteWindowMode = useSelector((state) => state.noteWindows.mode);
    const [type, setType] = useState('all');

    const notes = items.filter((item) => item.type === 'card').length;
    // An empty notebook: the title menu and Add (and ▭) still show; the rest
    // waits until there's something to play, copy, select, filter or sort.
    const empty = items.length === 0;
    const words = items.length - notes;
    const shown = search.results.filter((r) => type === 'all' || r.item.type === type);
    const shownItems = shown.map((r) => r.item);
    // Opening a text match goes to the match (WordbookPage reads ?q=).
    const linkTo = (item) => itemPath(name, item)
        + (search.textSearch && !search.tooShort ? `?q=${encodeURIComponent(search.query.trim())}` : '');
    const filterByTag = (tag) => { search.setMode('tag'); search.setQuery(tag); };

    const card = ({ item, snippet, where }, handleProps) => {
        const isNote = item.type === 'card';
        const tags = item.tags || [];
        const ticking = selection.selecting;
        const picked = ticking && selection.isPicked(item);
        const color = colorOf(colors, item);
        return (
            <div className="nb-card-wrap">
                <Link className={`nb-card${isNote ? ' nb-card--note' : ''}${picked ? ' is-picked' : ''}${keyOf(item) === lastKey ? ' is-last' : ''}${color ? ' has-color' : ''}`} to={linkTo(item)}
                    style={color ? { '--item-tint': color.tint, '--item-ink': color.ink } : undefined}
                    aria-pressed={ticking ? picked : undefined}
                    onClick={ticking ? (e) => { e.preventDefault(); selection.toggle(item); }
                        : (isNote && noteWindowMode ? (e) => { e.preventDefault(); dispatch(openNoteWindow(item)); } : undefined)}>
                    {ticking && <SelectCheck on={picked} />}
                    <span className={`nb-card__icon nb-row__icon nb-row__icon--${isNote ? 'card' : 'word'}`}
                        aria-hidden="true">
                        <i className={`${isNote ? 'sticky note outline' : 'font'} icon`}></i>
                    </span>
                    <span className="nb-card__text">
                        <span className="nb-card__title">{item.title}<ItemBadge notebook={name} item={item} /></span>
                        {snippet ? <MatchSnippet snippet={snippet} where={where} /> : (
                            <>
                                {isNote && item.preview && <span className="nb-card__preview">{item.preview}</span>}
                                {!isNote && <span className="nb-card__kind">Word</span>}
                            </>
                        )}
                        {tags.length > 0 && (
                            <span className="nb-card__tags">
                                {tags.map((t) => (
                                    // Inside the card's link, so not a <button>; it
                                    // filters instead of opening the card.
                                    <span key={t} role="button" tabIndex={0} className="nb-tag nb-tag--small"
                                        title={`Show items tagged “${t}”`}
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); filterByTag(t); }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); filterByTag(t); }
                                        }}>
                                        {t}
                                    </span>
                                ))}
                            </span>
                        )}
                    </span>
                </Link>
                {handleProps && (
                    <button type="button" className="nb-card__grip" aria-label={`Reorder ${item.title}`}
                        title="Drag to reorder" {...handleProps}>
                        <GripIcon size={14} />
                    </button>
                )}
                {!ticking && (
                    <ItemColorButton items={[{ type: item.type, id: item.id }]} label={null} className="nb-card__color" />
                )}
            </div>
        );
    };

    let grid = null;
    if (shown.length > 0 && sort === 'color') {
        const byKey = new Map(shown.map((r) => [keyOf(r.item), r]));
        grid = colorGroups(shownItems, colors).map(({ color, items: groupItems }) => (
            <section key={color ? color.key : '(none)'} className="nb-overview__group">
                <h2 className="nb-overview__group-title">
                    <span className={`item-color__dot${color ? '' : ' item-color__dot--none'}`} aria-hidden="true"
                        style={color ? { background: color.ink } : undefined} />
                    {color ? color.label : 'No color'} <span className="nb-overview__group-count">{groupItems.length}</span>
                </h2>
                <ul className="nb-overview__grid">
                    {groupItems.map((item) => <li key={keyOf(item)}>{card(byKey.get(keyOf(item)))}</li>)}
                </ul>
            </section>
        ));
    } else if (shown.length > 0 && sort === 'tag') {
        const byKey = new Map(shown.map((r) => [keyOf(r.item), r]));
        grid = tagGroups(shownItems).map(({ tag, items: groupItems }) => (
            <section key={tag || '(none)'} className="nb-overview__group">
                <h2 className="nb-overview__group-title">
                    {tag || 'No tag'} <span className="nb-overview__group-count">{groupItems.length}</span>
                </h2>
                <ul className="nb-overview__grid">
                    {groupItems.map((item) => <li key={keyOf(item)}>{card(byKey.get(keyOf(item)))}</li>)}
                </ul>
            </section>
        ));
    } else if (shown.length > 0) {
        // Dragging only in My order with everything shown: a filtered or
        // differently sorted list has no sensible place to drop into.
        const draggable = sort === 'custom' && !search.searching && type === 'all' && !selection.selecting;
        const byKey = new Map(shown.map((r) => [keyOf(r.item), r]));
        grid = (
            <SortableList
                grid
                className="nb-overview__grid"
                items={shownItems}
                disabled={!draggable}
                getKey={keyOf}
                onReorder={(reordered) => dispatch(reorderWordbookItems(name, reordered))}
                renderItem={(item, handleProps) => card(byKey.get(keyOf(item)), handleProps)}
            />
        );
    }

    return (
        <div className="nb-overview" ref={rootRef}>
            <div className="nb-overview__head">
                <div className="nb-overview__heading">
                    {/* The title is the notebook's menu: rename, all notebooks, delete. */}
                    <h1 className="nb-overview__title"><NotebookMenu name={name} className="nb-menu--overview" /></h1>
                    <div className="nb-overview__counts">
                        {[words ? plural(words, 'word') : null, notes ? plural(notes, 'note') : null]
                            .filter(Boolean).join(' · ')}
                    </div>
                </div>
                <div className="nb-overview__actions">
                    <button type="button" className="cb-btn cb-btn--accent" onClick={onAdd}>
                        <i className="plus icon" aria-hidden="true"></i>Add
                    </button>
                    {!empty && (
                        <ReadAloud getChunks={() => getReadAloudChunks(shownItems)} title={name} label="Play all" />
                    )}
                    <button type="button" className={`cb-btn cb-btn--ghost nb-overview__windows${noteWindowMode ? ' on' : ''}`}
                        aria-pressed={noteWindowMode} aria-label="Open notes in windows"
                        title={noteWindowMode ? 'Notes open in windows (click to turn off)' : 'Open notes in windows'}
                        onClick={() => dispatch(toggleNoteWindowMode())}>
                        <i className="window maximize outline icon" aria-hidden="true"></i>
                    </button>
                    {!empty && isAdmin && !selection.selecting && (
                        <CopyNotesButton title={name} getItems={() => shownItems} />
                    )}
                    {!empty && !selection.selecting && (
                        <button type="button" className="cb-btn cb-btn--ghost nb-overview__select" onClick={selection.start}
                            title="Tick notes to play just those">
                            <i className="check square outline icon" aria-hidden="true"></i>Select
                        </button>
                    )}
                </div>
            </div>

            {empty && !missing && (
                <div className="nb-overview__empty">
                    This notebook is empty. Click <strong>Add</strong> to look up a word or write a note.
                </div>
            )}
            {!empty && (
            <div className="nb-overview__tools">
                <NotebookSearchBar search={search} />
                <SortSelect sort={sort} onChange={onSort} />
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
            )}
            <TagPicker search={search} items={items} />
            {selection.selecting && (
                <SelectBar selection={selection} shownItems={shownItems} getChunks={playSelected} title={name}
                    extra={selection.picked.size > 0 && (
                        <>
                            <ItemColorButton items={items.filter((item) => selection.isPicked(item))} />
                            <DownloadSelectedButton notebook={name} items={items.filter((item) => selection.isPicked(item))} />
                            {isAdmin && (
                                <CopyNotesButton title={name} label="Copy selected"
                                    getItems={() => items.filter((item) => selection.isPicked(item))} />
                            )}
                        </>
                    )} />
            )}

            <NotebookSearchStatus search={search} />
            {grid}
            <MissingLine text={missing} />
        </div>
    );
}
