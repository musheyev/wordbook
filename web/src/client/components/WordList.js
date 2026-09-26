import React from "react";
import { connect } from 'react-redux';
import WordWithDelete from './WordWithDelete';

// The notebook's items in the desktop rail. Hovering an item reveals × to
// remove it from this notebook.
const WordList = (props) => {
    const words = props.wordbookWords || [];

    if (words.length === 0) {
        return null;
    }

    return (
        <div className="word-chips">
            {words.map((item, index) => (
                <WordWithDelete key={`wordWithDelete${item.type}${item.id}${index}`}
                    item={item} id={index} wordbook={props.wordbook} />
            ))}
        </div>
    );
};

function mapStatetoProps({ auth, wordbookWords }, ownProps) {
    return { auth, wordbookWords, wordbook: ownProps.wordbook };
}

export default connect(mapStatetoProps)(WordList);
