import React from "react";
import { connect } from 'react-redux';
import { reorderWordbookItems } from '../actions';
import WordWithDelete from './WordWithDelete';
import SortableList from './SortableList';
import Spinner from './Spinner';

// The notebook's items in the desktop rail. Hovering an item reveals a grip
// (⋮⋮) to drag it to a new position, and × to remove it from this notebook.
// A spinner only while there's no list for this notebook yet: a refresh of
// the list on screen (e.g. after saving a note) keeps showing it.
const WordList = ({ wordbook, wordbookWords, haveList, failed, reorderWordbookItems }) => {
    const words = haveList ? (wordbookWords || []) : [];

    if (!haveList) {
        return failed ? <div className="nav-ctx__failed">Couldn't load.</div> : <Spinner inline label="Loading…" />;
    }
    if (words.length === 0) {
        return null;
    }

    return (
        <SortableList
            className="word-chips"
            items={words}
            getKey={(item) => `${item.type}:${item.id}`}
            onReorder={(reordered) => reorderWordbookItems(wordbook, reordered)}
            renderItem={(item, handleProps) => (
                <WordWithDelete item={item} wordbook={wordbook} handleProps={handleProps} />
            )}
        />
    );
};

function mapStatetoProps({ wordbookWords, wordbookWordsFor, wordbookWordsError }, ownProps) {
    return {
        wordbookWords,
        haveList: wordbookWordsFor === ownProps.wordbook,
        failed: Boolean(wordbookWordsError && wordbookWordsError.wordbook === ownProps.wordbook),
        wordbook: ownProps.wordbook,
    };
}

export default connect(mapStatetoProps, { reorderWordbookItems })(WordList);
