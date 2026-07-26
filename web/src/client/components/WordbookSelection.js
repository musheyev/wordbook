import React from "react";
import WordbookCheckbox from './WordbookCheckbox';
import AddWordbook from './AddWordbook';

function WordbookSelection(props) {
    //NOTE: https://www.w3schools.com/howto/howto_js_media_queries.asp
    
    function calculateLeftPosition(x) {
        if (x.matches) { // If media query matches
            console.log(`media query matched, props.left=${props.left}`)
          return 0;
        } else {
            console.log(`media query not matched, props.left=${props.left}`)
          return props.left - 10 ;
        }
      }

    const x = window.matchMedia("(max-width: 400px)");
    const leftoffset = calculateLeftPosition(x);
    console.log(`leftoffset=${leftoffset}`)

    const styleObj = {
        left: `${leftoffset}px`,
    }

    const doneButtonStyle = {
        padding: "10px 20px",
        marginTop: "10px",
        backgroundColor: "green",
        border: "1px solid #ddd",
        color: "white",
        cursor: "pointer"
    }
    return (
        <div className="popup" style={styleObj}>
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