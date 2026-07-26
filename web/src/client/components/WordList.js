import React, { useState } from "react";
import { connect } from 'react-redux';
import WordWithDelete from './WordWithDelete';

const WordList = (props) => {
    const [editing, setEditing] = useState(false);
    const words = props.wordbookWords || [];

    if (words.length === 0) {
        return null;
    }

    return (
        <div>
            <div className="word-chips__toolbar">
                <button className="button-as-link word-chips__edit"
                    onClick={() => setEditing((e) => !e)}>
                    {editing ? 'Done' : 'Edit'}
                </button>
            </div>

            <div className={`word-chips${editing ? ' editing' : ''}`}>
                {words.map((word, index) => (
                    <WordWithDelete key={`wordWithDelete${index}`}
                        word={word} id={index} wordbook={props.wordbook} />
                ))}
            </div>
        </div>
    );
};

function mapStatetoProps({ auth, wordbookWords }, ownProps) {
    return { auth, wordbookWords, wordbook: ownProps.wordbook };
}

export default connect(mapStatetoProps)(WordList);
