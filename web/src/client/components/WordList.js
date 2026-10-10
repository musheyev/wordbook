import React from "react";
import { connect } from 'react-redux';
import { reorderWordbookItems } from '../actions';
import WordWithDelete from './WordWithDelete';
import SortableList from './SortableList';
import Spinner from './Spinner';
import { sortItems, DEFAULT_ITEM_SORT } from '../utils/itemSort';

// The notebook's items in the desktop rail, in the notebook's chosen sort
// (utils/itemSort.js). Hovering an item reveals × to remove it from this
// notebook and, in My order, a grip (⋮⋮) to drag it to a new position.
// A spinner only while there's no list for this notebook yet: a refresh of
// the list on screen (e.g. after saving a note) keeps showing it.
const WordList = ({ wordbook, wordbookWords, haveList, failed, sort, reorderWordbookItems }) => {
    const words = haveList ? sortItems(wordbookWords || [], sort) : [];

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
            disabled={sort !== 'custom'}
            getKey={(item) => `${item.type}:${item.id}`}
            onReorder={(reordered) => reorderWordbookItems(wordbook, reordered)}
            renderItem={(item, handleProps) => (
                <WordWithDelete item={item} wordbook={wordbook} handleProps={handleProps} />
            )}
        />
    );
};

function mapStatetoProps({ wordbookWords, wordbookWordsFor, wordbookWordsError, itemSorts }, ownProps) {
    return {
        wordbookWords,
        sort: (itemSorts && itemSorts[ownProps.wordbook]) || DEFAULT_ITEM_SORT,
        haveList: wordbookWordsFor === ownProps.wordbook,
        failed: Boolean(wordbookWordsError && wordbookWordsError.wordbook === ownProps.wordbook),
        wordbook: ownProps.wordbook,
    };
}

export default connect(mapStatetoProps, { reorderWordbookItems })(WordList);
