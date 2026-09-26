import React from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { reorderWordbookItems } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import SortableList from './SortableList';

// A notebook's items as tappable rows (the page a notebook opens on, on
// phones). Drag a row's grip (⋮⋮) up or down to change the order; the new
// order is saved to the notebook (see reorderWordbookItems).
function NotebookItemList({ wordbook, items, reorderWordbookItems }) {
    const notes = items.filter((item) => item.type === 'card').length;
    const words = items.length - notes;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    return (
        <div className="nb-list">
            <div className="nb-list__count">
                {plural(items.length, 'item', 'items')}
                {notes > 0 && words > 0 && ` · ${plural(notes, 'note', 'notes')}, ${plural(words, 'word', 'words')}`}
            </div>
            <SortableList
                className="nb-list__rows"
                items={items}
                getKey={(item) => `${item.type}:${item.id}`}
                onReorder={(reordered) => reorderWordbookItems(wordbook, reordered)}
                renderItem={(item, handleProps) => {
                    const isCard = item.type === 'card';
                    return (
                        <div className="nb-row-wrap">
                            {/* The grip is a sibling of the link, not inside it,
                                so dragging never also counts as opening the item. */}
                            <button type="button" className="nb-row__grip"
                                aria-label={`Reorder ${item.title}`} {...handleProps}>
                                <i className="grip vertical icon" aria-hidden="true"></i>
                            </button>
                            <Link className="nb-row" to={itemPath(wordbook, item)}>
                                <span className={`nb-row__icon nb-row__icon--${item.type}`} aria-hidden="true">
                                    <i className={`${isCard ? 'sticky note outline' : 'font'} icon`}></i>
                                </span>
                                <span className="nb-row__text">
                                    <span className="nb-row__title">{item.title}</span>
                                    <span className="nb-row__sub">
                                        {isCard ? (item.preview || 'Note') : 'Word'}
                                    </span>
                                </span>
                                <i className="chevron right icon nb-row__chev" aria-hidden="true"></i>
                            </Link>
                        </div>
                    );
                }}
            />
        </div>
    );
}

export default connect(null, { reorderWordbookItems })(NotebookItemList);
