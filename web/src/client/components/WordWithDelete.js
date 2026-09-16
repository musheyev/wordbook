import React from "react";
import { connect } from 'react-redux';
import { fetchWordData, fetchCardData, deleteWordbookWord, deleteWordbookCard } from '../actions';

// Renders one item chip in a wordbook. `item` is a typed object:
//   { type: 'word'|'card', id, title }
// Cards get a distinct look (📝 + accent) and route clicks/deletes to the
// card-specific actions. The × removes the item from THIS wordbook only.
const WordWithDelete = ({ item, wordbook, selected, fetchWordData, fetchCardData, deleteWordbookWord, deleteWordbookCard }) => {

    const isCard = item.type === 'card';

    const onClick = () => {
        if (isCard) {
            fetchCardData(item.id);
        } else {
            fetchWordData(item.id);
        }
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
        ? `Remove card from ${wordbook}`
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

export default connect(mapStatetoProps, { fetchWordData, fetchCardData, deleteWordbookWord, deleteWordbookCard })(WordWithDelete);
