import React, { useEffect, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbookWord, deleteWordbookCard, openNoteWindow } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import GripIcon from './GripIcon';

// Renders one item in a notebook's list. `item` is a typed object:
//   { type: 'word'|'card', id, title }
// Clicking opens the item's URL (WordbookPage loads it). The × removes the
// item from THIS notebook only. `handleProps` (from SortableList) turns the
// grip into a drag handle for reordering.
const WordWithDelete = ({ item, wordbook, selected, handleProps, noteWindowMode, deleteWordbookWord, deleteWordbookCard, openNoteWindow }) => {
    const navigate = useNavigate();
    const isCard = item.type === 'card';
    const rowRef = useRef(null);

    // The open item stays in view in a long list (e.g. after stepping to it
    // with the ⌃ ⌄ buttons, or opening it from the overview).
    useEffect(() => {
        if (selected && rowRef.current) rowRef.current.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const onClick = () => {
        // Window mode (desktop only): notes open in a floating window instead of
        // taking over the main pane. Words always use the normal page.
        if (isCard && noteWindowMode && typeof window !== 'undefined' && window.innerWidth > 768) {
            openNoteWindow(item);
            return;
        }
        navigate(itemPath(wordbook, item));
    };

    const onDelete = (e) => {
        e.stopPropagation();
        if (isCard) {
            deleteWordbookCard(wordbook, item.id);
        } else {
            deleteWordbookWord(wordbook, item.id);
        }
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    const removeTitle = isCard
        ? `Remove note from ${wordbook}`
        : `Remove ${item.title}`;

    return (
        <div ref={rowRef} className={`word-chip${selected ? ' selected' : ''}`}
            role="button" tabIndex={0}
            onClick={onClick} onKeyDown={onKeyDown}>
            {handleProps && (
                // stopPropagation: a click, or the Space/Enter that picks the
                // row up for a keyboard drag, must not also reach the row
                // (which opens the item on click and on Space/Enter).
                <span className="word-chip__grip" aria-label={`Reorder ${item.title}`}
                    {...handleProps}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { handleProps.onKeyDown && handleProps.onKeyDown(e); e.stopPropagation(); }}>
                    <GripIcon size={14} />
                </span>
            )}
            <span className="word-chip__label">{item.title}</span>
            <i className="word-chip__x" title={removeTitle} aria-label={removeTitle}
                onClick={onDelete}>×</i>
        </div>
    );
};

function mapStatetoProps({ currentWord, noteWindows }, ownProps) {
    return {
        selected: currentWord === ownProps.item.id,
        item: ownProps.item,
        wordbook: ownProps.wordbook,
        noteWindowMode: noteWindows.mode,
    };
}

export default connect(mapStatetoProps, { deleteWordbookWord, deleteWordbookCard, openNoteWindow })(WordWithDelete);
