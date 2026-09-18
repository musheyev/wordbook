import React, { useState } from 'react';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard } from '../actions';
import Definition from './Definition';
import WordbookSelection from './WordbookSelection';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';

function SearchResult({ currentWord, currentWordType, currentCard, wordSearchResult, auth, wordbooks,
    fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard }) {
    const [wordbookSelectionPopupPosition, setPopupPosition] = useState(0);
    const [shouldDisplayPopup, setShouldDisplayPopup] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // Render any KaTeX math in the card body after the HTML is in the DOM.
    const cardRef = React.useRef(null);
    React.useEffect(() => {
        renderMathIn(cardRef.current);
    });

    // Reset the delete confirmation whenever the selected item changes.
    React.useEffect(() => {
        setConfirmingDelete(false);
    }, [currentWord]);

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

    const isCard = currentWordType === 'card';
    // The card content is fetched after selection; until it arrives (and matches
    // the selected id) show a blank pane rather than the raw card_id (a GUID).
    const cardReady = isCard && currentCard != null && currentCard.card_id === currentWord;

    // Shared "Add to wordbook" icon button + popup (used by both words and cards).
    // Recompute the popup position on every click so it always opens next to the
    // button (the old one-time capture went stale when the button moved).
    const addToWordbookButton = (
        <button className="card-tool" title="Add to wordbook" aria-label="Add to wordbook"
            onClick={() => setShouldDisplayPopup((v) => !v)}>
            <i className="bookmark outline icon"></i>
        </button>
    );

    const wordbookPopup = shouldDisplayPopup ? (
        <WordbookSelection left={wordbookSelectionPopupPosition}
            wordbooks={wordbooks}
            onDone={() => setShouldDisplayPopup(false)} />
    ) : "";

    // ---- Card view ---------------------------------------------------------
    if (isCard) {
        // Card selected but its content hasn't loaded yet: blank pane, no GUID.
        if (!cardReady) {
            return <div className="search-result" />;
        }
        return (
            <div className="search-result search-result--card">
                <div className="current-word-container">
                    <div className="card-heading">
                        <h2>{currentCard.title}</h2>
                    </div>
                    <div className="card-header-actions">
                        {/* Edit / Delete live up here (as a toolbar) so they stay
                            visible no matter how long the card is. */}
                        <button className="card-tool" title="Edit card" aria-label="Edit card"
                            onClick={() => openCardEditor({ mode: 'edit', card: currentCard })}>
                            <i className="edit icon"></i>
                        </button>
                        <button className="card-tool card-tool--danger" title="Delete card" aria-label="Delete card"
                            onClick={() => setConfirmingDelete(true)}>
                            <i className="trash alternate outline icon"></i>
                        </button>
                        {addToWordbookButton}
                    </div>
                </div>

                {confirmingDelete && (
                    <div className="card-confirm">
                        <span className="card-confirm__msg">
                            Delete "{currentCard.title}" from every wordbook? This can't be undone.
                        </span>
                        <span className="card-confirm__actions">
                            <button className="card-confirm__cancel"
                                onClick={() => setConfirmingDelete(false)}>Cancel</button>
                            <button className="card-confirm__delete"
                                onClick={() => deleteCard(currentCard.card_id)}>Delete</button>
                        </span>
                    </div>
                )}

                {wordbookPopup}

                {/* Scrollbar lives on the card content so the header/toolbar stays put. */}
                <div className="card-content card-content--scroll" ref={cardRef}
                    dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(currentCard.content) }} />
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
