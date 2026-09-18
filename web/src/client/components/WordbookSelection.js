import React from "react";
import WordbookCheckbox from './WordbookCheckbox';
import AddWordbook from './AddWordbook';

function WordbookSelection(props) {
    // The popup is anchored to the right edge of the pane via CSS (it opens under
    // the top-right "Add to wordbook" icon), so no x-position is computed here.
    const doneButtonStyle = {
        padding: "10px 20px",
        marginTop: "10px",
        backgroundColor: "green",
        border: "1px solid #ddd",
        color: "white",
        cursor: "pointer"
    }
    return (
        <div className="popup">
            <div className="arrowup">
            </div>
            <div className="wordbook-selection-container ui">
                <div className="wordbook-checkboxes-container">
                    {props.wordbooks != [] ? props.wordbooks.map((wordbook, index) => (
                        <WordbookCheckbox key={`wordbookcheckbox${index}`} wordbookName={wordbook} id={index} />))
                        : ""}
                </div>

                <div style={{ marginTop: "10px" }}>
                    <AddWordbook displayLabel="Create New Wordbook" />
                </div>
                <div style={{ display: "flex" , justifyContent: "flex-end"}}>
                <button style={doneButtonStyle} onClick={() => props.onDone()}>Done</button>
                </div>
            </div>
        </div>
    );
}

export default WordbookSelection;