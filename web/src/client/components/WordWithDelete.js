import React from "react";
import { useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbookWord, deleteWordbookCard } from '../actions';
import { itemPath } from '../utils/notebookPaths';

// Renders one item in a notebook's list. `item` is a typed object:
//   { type: 'word'|'card', id, title }
// Clicking opens the item's URL (WordbookPage loads it). The × removes the
// item from THIS notebook only.
const WordWithDelete = ({ item, wordbook, selected, deleteWordbookWord, deleteWordbookCard }) => {
    const navigate = useNavigate();
    const isCard = item.type === 'card';

    const onClick = () => {
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
        <div className={`word-chip${selected ? ' selected' : ''}`}
            role="button" tabIndex={0}
            onClick={onClick} onKeyDown={onKeyDown}>
            <span className="word-chip__label">{item.title}</span>
            <i className="word-chip__x" title={removeTitle} aria-label={removeTitle}
                onClick={onDelete}>×</i>
        </div>
    );
};

function mapStatetoProps({ currentWord }, ownProps) {
    return {
        selected: currentWord === ownProps.item.id,
        item: ownProps.item,
        wordbook: ownProps.wordbook,
    };
}

export default connect(mapStatetoProps, { deleteWordbookWord, deleteWordbookCard })(WordWithDelete);
