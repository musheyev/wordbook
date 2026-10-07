import React from "react";
import { connect } from 'react-redux';
import { reorderWordbookItems } from '../actions';
import WordWithDelete from './WordWithDelete';
import SortableList from './SortableList';
import Spinner from './Spinner';

// The notebook's items in the desktop rail. Hovering an item reveals a grip
// (⋮⋮) to drag it to a new position, and × to remove it from this notebook.
// While the list is loading, a spinner.
const WordList = ({ wordbook, wordbookWords, loading, reorderWordbookItems }) => {
    const words = wordbookWords || [];

    if (loading) {
        return <Spinner inline label="Loading…" />;
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

function mapStatetoProps({ wordbookWords, wordbookWordsInProgress }, ownProps) {
    return { wordbookWords, loading: Boolean(wordbookWordsInProgress), wordbook: ownProps.wordbook };
}

export default connect(mapStatetoProps, { reorderWordbookItems })(WordList);
