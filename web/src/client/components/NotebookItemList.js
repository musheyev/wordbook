import React from 'react';
import { Link } from 'react-router-dom';
import { itemPath } from '../utils/notebookPaths';

// A notebook's items as tappable rows (the page a notebook opens on, on phones).
function NotebookItemList({ wordbook, items }) {
    const notes = items.filter((item) => item.type === 'card').length;
    const words = items.length - notes;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    return (
        <div className="nb-list">
            <div className="nb-list__count">
                {plural(items.length, 'item', 'items')}
                {notes > 0 && words > 0 && ` · ${plural(notes, 'note', 'notes')}, ${plural(words, 'word', 'words')}`}
            </div>
            <ul className="nb-list__rows">
                {items.map((item, index) => {
                    const isCard = item.type === 'card';
                    return (
                        <li key={`${item.type}${item.id}${index}`}>
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
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default NotebookItemList;
