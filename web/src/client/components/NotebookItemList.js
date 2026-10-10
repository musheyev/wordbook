import React from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { reorderWordbookItems } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import SortableList from './SortableList';
import GripIcon from './GripIcon';
import NotebookSearchBar, {
    NotebookSearchStatus, MatchSnippet, TagPicker, SortSelect,
} from './NotebookSearchBar';
import { SelectBar, SelectCheck } from './NotebookSelect';

// A notebook's items as tappable rows (the page a notebook opens on, on
// phones), in the notebook's sort (`items` comes sorted; Sort changes it).
// In My order, drag a row's grip (⋮⋮) up or down to change the order; the
// new order is saved to the notebook (see reorderWordbookItems). A search box
// above filters by title or tag, or searches everything (`search`, from
// WordbookPage's useNotebookSearch); while searching, the matches show
// without grips, with the passage that matched. Select ticks rows (tapping a
// row ticks it) for Play selected (`selection`, NotebookSelect.js).
function NotebookItemList({ wordbook, items, search, sort, onSort, selection, playSelected, reorderWordbookItems }) {
    const notes = items.filter((item) => item.type === 'card').length;
    const words = items.length - notes;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const linkTo = (item) => itemPath(wordbook, item)
        + (search.textSearch && !search.tooShort ? `?q=${encodeURIComponent(search.query.trim())}` : '');

    const ticking = selection.selecting;
    const row = (item, after) => {
        const isCard = item.type === 'card';
        const picked = ticking && selection.isPicked(item);
        return (
            <Link className={`nb-row${picked ? ' is-picked' : ''}`} to={linkTo(item)}
                aria-pressed={ticking ? picked : undefined}
                onClick={ticking ? (e) => { e.preventDefault(); selection.toggle(item); } : undefined}>
                {ticking ? <SelectCheck on={picked} /> : (
                    <span className={`nb-row__icon nb-row__icon--${item.type}`} aria-hidden="true">
                        <i className={`${isCard ? 'sticky note outline' : 'font'} icon`}></i>
                    </span>
                )}
                <span className="nb-row__text">
                    <span className="nb-row__title">{item.title}</span>
                    {after || (
                        <span className="nb-row__sub">{isCard ? (item.preview || 'Note') : 'Word'}</span>
                    )}
                </span>
                <i className="chevron right icon nb-row__chev" aria-hidden="true"></i>
            </Link>
        );
    };

    const shownItems = search.results.map((r) => r.item);
    const tools = (
        <>
            <NotebookSearchBar search={search} className="nb-search--list" />
            <TagPicker search={search} items={items} />
            {ticking && (
                <SelectBar selection={selection} shownItems={shownItems} getChunks={playSelected} title={wordbook} />
            )}
        </>
    );

    if (search.searching) {
        return (
            <div className="nb-list">
                {tools}
                <NotebookSearchStatus search={search} />
                <ul className="nb-list__rows">
                    {search.results.map(({ item, snippet, where }) => (
                        <li key={`${item.type}:${item.id}`}>
                            {row(item, snippet ? <MatchSnippet snippet={snippet} where={where} /> : null)}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    return (
        <div className="nb-list">
            {tools}
            <div className="nb-list__count">
                <span>
                    {plural(items.length, 'item', 'items')}
                    {notes > 0 && words > 0 && ` · ${plural(notes, 'note', 'notes')}, ${plural(words, 'word', 'words')}`}
                </span>
                <span className="nb-list__count-tools">
                    {!ticking && (
                        <button type="button" className="nb-list__select" onClick={selection.start}>Select</button>
                    )}
                    <SortSelect sort={sort} onChange={onSort} />
                </span>
            </div>
            {sort !== 'custom' && (
                <div className="nb-list__hint">To rearrange by dragging, sort by My order.</div>
            )}
            <SortableList
                className="nb-list__rows"
                items={items}
                disabled={sort !== 'custom' || ticking}
                getKey={(item) => `${item.type}:${item.id}`}
                onReorder={(reordered) => reorderWordbookItems(wordbook, reordered)}
                renderItem={(item, handleProps) => (
                    <div className="nb-row-wrap">
                        {/* The grip is a sibling of the link, not inside it,
                            so dragging never also counts as opening the item. */}
                        {handleProps && (
                            <button type="button" className="nb-row__grip"
                                aria-label={`Reorder ${item.title}`} {...handleProps}>
                                <GripIcon size={18} />
                            </button>
                        )}
                        {row(item)}
                    </div>
                )}
            />
        </div>
    );
}

export default connect(null, { reorderWordbookItems })(NotebookItemList);
