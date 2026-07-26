import React from "react";
import { connect } from 'react-redux';
import { fetchWordData, deleteWordbookWord } from '../actions';

const WordWithDelete = ({ word, wordbook, selected, fetchWordData, deleteWordbookWord }) => {

    const onWordClick = () => {
        fetchWordData(word);
    };

    const onWordDelete = (e) => {
        e.stopPropagation();
        deleteWordbookWord(wordbook, word);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onWordClick();
        }
    };

    return (
        <div className={`word-chip${selected ? ' selected' : ''}`}
            role="button" tabIndex={0}
            onClick={onWordClick} onKeyDown={onKeyDown}>
            <span className="word-chip__label">{word}</span>
            <i className="word-chip__x" title={`Remove ${word}`} aria-label={`Remove ${word}`}
                onClick={onWordDelete}>×</i>
        </div>
    );
};

function mapStatetoProps({ currentWord }, ownProps) {
    return {
        selected: currentWord === ownProps.word,
        word: ownProps.word,
        wordbook: ownProps.wordbook,
    };
}

export default connect(mapStatetoProps, { fetchWordData, deleteWordbookWord })(WordWithDelete);
