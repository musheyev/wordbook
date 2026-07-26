import React, { useState } from 'react';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordWordbooks } from '../actions';
import Definition from './Definition';
import WordbookSelection from './WordbookSelection';

function SearchResult({ currentWord, wordSearchResult, auth, wordbooks, fetchWordbooks, fetchWordWordbooks }) {
    const [wordbookSelectionPopupPosition, setPopupPosition] = useState(0);
    const [shouldDisplayPopup, setShouldDisplayPopup] = useState(false);

    if (auth != "") {
        console.log("Should get wordbooks");
        console.log(Object.keys(wordbooks).length === 0);

        React.useEffect(
            () => {
                fetchWordbooks();
            }, [auth]
        );

        //if (currentWord != "") {
        React.useEffect(
            () => {
                fetchWordWordbooks(currentWord);
            }, [auth, currentWord]
        );
        //}
    }

    return (
        <>
            <div className="search-result" >

                {currentWord != "" ?
                    <>
                        <div className="current-word-container">
                            <div><h2>{currentWord}</h2> </div>
                            <div>
                                <button className="ui right labeled icon button" style={{ display: "inline-block" }}
                                    ref={el => {
                                        // el can be null - see https://reactjs.org/docs/refs-and-the-dom.html#caveats-with-callback-refs
                                        if (!el) return;

                                        //console.log(el.getBoundingClientRect().left);

                                        if (wordbookSelectionPopupPosition === 0) {
                                            setPopupPosition(el.getBoundingClientRect().left);
                                        }
                                    }}
                                    onClick={() => setShouldDisplayPopup(!shouldDisplayPopup)}
                                >
                                    <i className="right arrow icon"></i>
                                    Add to Wordbook
                                </button>
                            </div>
                        </div>

                        {shouldDisplayPopup ? <WordbookSelection left={wordbookSelectionPopupPosition}
                            wordbooks={wordbooks}
                            onDone={() => setShouldDisplayPopup(false)} /> : ""}


                    </>
                    : ""}

                {wordSearchResult == null || Object.keys(wordSearchResult).length === 0 || Object.keys(wordSearchResult.definitions).length === 0 ? "" :
                    Object.entries(wordSearchResult.definitions).map(([k, v]) => (
                        <div key={k}>
                            <div>
                                <em className="source-dictionary">{k}</em>
                            </div>
                            <ul>
                                {v.map((listEntry, index) => (
                                    <Definition text={listEntry} key={"".concat(k, index)}>

                                    </Definition>
                                ))}
                            </ul>
                        </div>
                    ))
                }
            </div>

            <div className="image-search-result">
                {wordSearchResult == null || Object.keys(wordSearchResult).length === 0 || wordSearchResult.images.length === 0 ? "" :
                    wordSearchResult.images.map((imageURL, index) => (
                        <img key={index + 100} src={imageURL} alt="image"></img>


                    ))
                }
            </div>
        </>
    );
}

function mapStatetoProps({ auth, currentWord, word, wordbooks }, ownProps) {
    return { auth, currentWord, wordSearchResult: word, wordbooks };
}

export default connect(mapStatetoProps, { fetchWordWordbooks, fetchWordbooks })(SearchResult);