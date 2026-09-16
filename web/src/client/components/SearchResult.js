import React, { useState } from 'react';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard } from '../actions';
import Definition from './Definition';
import WordbookSelection from './WordbookSelection';
import { sanitizeCardHtml } from '../utils/sanitize';

function SearchResult({ currentWord, currentWordType, currentCard, wordSearchResult, auth, wordbooks,
    fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard }) {
    const [wordbookSelectionPopupPosition, setPopupPosition] = useState(0);
    const [shouldDisplayPopup, setShouldDisplayPopup] = useState(false);

    if (auth != "") {
        React.useEffect(
            () => {
                fetchWordbooks();
            }, [auth]
        );

        React.useEffect(
            () => {
                fetchWordWordbooks(currentWord);
            }, [auth, currentWord]
        );
    }

    const isCard = currentWordType === 'card' && currentCard != null;

    // Shared "Add to Wordbook" button + popup (used by both words and cards).
    const addToWordbookButton = (
        <div>
            <button className="ui right labeled icon button" style={{ display: "inline-block" }}
                ref={el => {
                    if (!el) return;
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
    );

    const wordbookPopup = shouldDisplayPopup ? (
        <WordbookSelection left={wordbookSelectionPopupPosition}
            wordbooks={wordbooks}
            onDone={() => setShouldDisplayPopup(false)} />
    ) : "";

    // ---- Card view ---------------------------------------------------------
    if (isCard) {
        return (
            <div className="search-result">
                <div className="current-word-container">
                    <div>
                        <h2>
                            {currentCard.title}
                            <span className="card-badge" title="Manual card">📝 My note</span>
                        </h2>
                    </div>
                    {addToWordbookButton}
                </div>

                {wordbookPopup}

                <div className="card-content"
                    dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(currentCard.content) }} />

                <div className="card-actions">
                    <button className="button-as-link"
                        onClick={() => openCardEditor({ mode: 'edit', card: currentCard })}>
                        Edit
                    </button>
                    <button className="button-as-link card-actions__delete"
                        onClick={() => {
                            if (window.confirm('Delete this card from every wordbook? This cannot be undone.')) {
                                deleteCard(currentCard.card_id);
                            }
                        }}>
                        Delete
                    </button>
                </div>
            </div>
        );
    }

    // ---- Word (dictionary) view -------------------------------------------
    return (
        <>
            <div className="search-result" >

                {currentWord != "" ?
                    <>
                        <div className="current-word-container">
                            <div><h2>{currentWord}</h2> </div>
                            {addToWordbookButton}
                        </div>

                        {wordbookPopup}
                    </>
                    : ""}

                {wordSearchResult == null || Object.keys(wordSearchResult).length === 0 || wordSearchResult.definitions == null || Object.keys(wordSearchResult.definitions).length === 0 ? "" :
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
                {wordSearchResult == null || Object.keys(wordSearchResult).length === 0 || wordSearchResult.images == null || wordSearchResult.images.length === 0 ? "" :
                    wordSearchResult.images.map((imageURL, index) => (
                        <img key={index + 100} src={imageURL} alt="image"></img>


                    ))
                }
            </div>
        </>
    );
}

function mapStatetoProps({ auth, currentWord, currentWordType, currentCard, word, wordbooks }, ownProps) {
    return { auth, currentWord, currentWordType, currentCard, wordSearchResult: word, wordbooks };
}

export default connect(mapStatetoProps, { fetchWordWordbooks, fetchWordbooks, openCardEditor, deleteCard })(SearchResult);
