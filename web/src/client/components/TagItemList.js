import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { openNoteWindow } from '../actions';
import { tagItemPath, itemsWithTag } from '../utils/tagPaths';
import { isPhoneLayout } from '../utils/phoneLayout';
import { colorOf } from '../utils/itemColors';

// A tag's notes and words in the side panel (Header.js), while one of them is
// open in the tag view (TagViewPage). Looks like a notebook's list
// (WordList / WordWithDelete, same .word-chip rows), but a tag has no order
// of its own (A to Z) and nothing to remove an item from, so there's no
// grip and no ×. In window mode a note opens in a floating window, as in a
// notebook.
export default function TagItemList({ tag }) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const allTags = useSelector((state) => state.allTags);
    const currentWord = useSelector((state) => state.currentWord);
    const noteWindowMode = useSelector((state) => state.noteWindows.mode);
    const itemColors = useSelector((state) => state.itemColors);

    const open = (item) => {
        if (item.type === 'card' && noteWindowMode && !isPhoneLayout()) {
            dispatch(openNoteWindow(item));
            return;
        }
        navigate(tagItemPath(tag, item));
    };

    return (
        <div className="word-chips">
            {itemsWithTag(allTags, tag).map((item) => {
                const color = colorOf(itemColors, item);
                return (
                    <div key={`${item.type}:${item.id}`} role="button" tabIndex={0}
                        className={`word-chip${currentWord === item.id ? ' selected' : ''}`}
                        onClick={() => open(item)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(item); }
                        }}>
                        <span className="word-chip__dot" aria-hidden="true"
                            style={color ? { background: color.ink } : undefined} />
                        <span className="word-chip__label">{item.title}</span>
                    </div>
                );
            })}
        </div>
    );
}
