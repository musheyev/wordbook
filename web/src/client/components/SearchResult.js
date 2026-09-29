import React, { useState } from 'react';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard } from '../actions';
import Definition from './Definition';
import AddToCardbook from './AddToCardbook';
import ReadAloud from './ReadAloud';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { htmlToChunks, htmlToPlainText, textToChunks } from '../utils/tts';
import TranslateMenu from './TranslateMenu';
import ShareDialog from './ShareDialog';
import WordImages from './WordImages';

function SearchResult({ currentWord, currentWordType, currentCard, wordSearchResult, auth, wordbooks,
    fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard }) {
    const [shouldDisplayPopup, setShouldDisplayPopup] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [sharing, setSharing] = useState(false);

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

    // Shared "Add to cardbook" bookmark button + popover (used by both words and
    // cards). The popover is anchored to the button so it drops right under it.
    const addToWordbookControl = (
        <span className="a2c-anchor">
            <button className="card-tool" title="Add to notebook" aria-label="Add to notebook"
                onClick={() => setShouldDisplayPopup((v) => !v)}>
                <i className="bookmark outline icon"></i>
            </button>
            {shouldDisplayPopup && (
                <AddToCardbook align="left" onClose={() => setShouldDisplayPopup(false)} />
            )}
        </span>
    );

    // Share button + dialog (used by both words and cards): sends a copy of
    // the current item to another user's Inbox.
    const shareItemInfo = isCard
        ? { type: 'card', id: currentWord, title: cardReady ? currentCard.title : '' }
        : { type: 'word', id: currentWord, title: currentWord };
    const shareControl = (
        <>
            <button className="card-tool" title="Share with someone" aria-label="Share with someone"
                onClick={() => setSharing(true)}>
                <i className="paper plane outline icon"></i>
            </button>
            <ShareDialog open={sharing} item={shareItemInfo} onClose={() => setSharing(false)} />
        </>
    );

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
                        <button className="card-tool" title="Edit note" aria-label="Edit note"
                            onClick={() => openCardEditor({ mode: 'edit', card: currentCard })}>
                            <i className="edit icon"></i>
                        </button>
                        <button className="card-tool card-tool--danger" title="Delete note" aria-label="Delete note"
                            onClick={() => setConfirmingDelete(true)}>
                            <i className="trash alternate outline icon"></i>
                        </button>
                        <ReadAloud getChunks={() => htmlToChunks(currentCard.content)} title={currentCard.title} />
                        {addToWordbookControl}
                        {shareControl}
                    </div>
                </div>

                {confirmingDelete && (
                    <div className="card-confirm">
                        <span className="card-confirm__msg">
                            Delete "{currentCard.title}" from every notebook? This can't be undone.
                        </span>
                        <span className="card-confirm__actions">
                            <button className="card-confirm__cancel"
                                onClick={() => setConfirmingDelete(false)}>Cancel</button>
                            <button className="card-confirm__delete"
                                onClick={() => deleteCard(currentCard.card_id)}>Delete</button>
                        </span>
                    </div>
                )}

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
                            <div className="card-header-actions">
                                <ReadAloud title={currentWord}
                                    getChunks={() => textToChunks(`${currentWord}. ${htmlToPlainText(
                                        Object.values((wordSearchResult && wordSearchResult.definitions) || {}).flat().join(' '))}`)} />
                                {addToWordbookControl}
                                {shareControl}
                                {/* Google's own definition box can't be fetched or
                                    embedded, so open its "define" search instead. */}
                                <a className="card-tool card-tool--google" title="Define on Google"
                                    aria-label="Define on Google" target="_blank" rel="noopener noreferrer"
                                    href={`https://www.google.com/search?q=${encodeURIComponent(`define ${currentWord}`)}`}>
                                    <span className="card-tool__g" aria-hidden="true">G</span>
                                </a>
                                {/* Example sentences: Google search for use "<word>" in a sentence. */}
                                <a className="card-tool card-tool--sentence" title="See it used in a sentence"
                                    aria-label="See it used in a sentence" target="_blank" rel="noopener noreferrer"
                                    href={`https://www.google.com/search?q=${encodeURIComponent(`use "${currentWord}" in a sentence`)}`}>
                                    <span className="card-tool__g" aria-hidden="true">T</span>
                                </a>
                                <TranslateMenu word={currentWord} />
                            </div>
                        </div>
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

            {currentWord != "" && wordSearchResult && Array.isArray(wordSearchResult.images) && (
                <WordImages word={currentWord} images={wordSearchResult.images} />
            )}
        </>
    );
}

function mapStatetoProps({ auth, currentWord, currentWordType, currentCard, word, wordbooks }, ownProps) {
    return { auth, currentWord, currentWordType, currentCard, wordSearchResult: word, wordbooks };
}

export default connect(mapStatetoProps, { fetchWordWordbooks, fetchWordbooks, openCardEditor, deleteCard })(SearchResult);
