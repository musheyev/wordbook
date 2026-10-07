import React, { useState } from 'react';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard, saveWordNote, deleteWordNote, fetchSourceVotes, setSourceVote, fetchWordData, fetchCardData, requestErrorMessage } from '../actions';
import Definition from './Definition';
import Spinner from './Spinner';
import LoadError from './LoadError';
import useDraft from '../utils/useDraft';
import { timeAgo } from '../utils/timeAgo';
import AddToCardbook from './AddToCardbook';
import ReadAloud from './ReadAloud';
import RichTextEditor from './LazyRichTextEditor';
import ItemTags from './ItemTags';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { htmlToChunks, htmlToPlainText, textToChunks } from '../utils/tts';
import TranslateMenu from './TranslateMenu';
import ShareDialog from './ShareDialog';
import WordImages from './WordImages';

// True when a note's HTML has no visible text (empty editor, whitespace only).
function isEmptyHtml(html) {
    return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
}

function SearchResult({ currentWord, currentWordType, currentCard, wordSearchResult, wordNote, auth, wordbooks,
    fetchWordbooks, fetchWordWordbooks, openCardEditor, deleteCard, saveWordNote, deleteWordNote, fetchWordData, fetchCardData,
    fetchSourceVotes, setSourceVote }) {
    const [shouldDisplayPopup, setShouldDisplayPopup] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [editingNote, setEditingNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState('');

    // Per-user dictionary-source thumbs. `sourceVotes` drives the thumb highlight
    // and updates live on click; `sourceOrder` is the display order of the
    // dictionary names, FROZEN when the word loads so voting never reshuffles
    // the page (it re-ranks only the next time a word loads). votesLoaded gates
    // the one-time freeze. Only the order is frozen, never the definitions.
    const [sourceVotes, setSourceVotes] = useState({});
    const [sourceOrder, setSourceOrder] = useState(null);
    const [votesLoaded, setVotesLoaded] = useState(false);

    // The store keeps the last looked-up word's data until the next lookup
    // answers, so right after switching words it still holds the previous
    // word's. Use it only when it is for the word on screen.
    const wordData = wordSearchResult && wordSearchResult.word === currentWord ? wordSearchResult : null;
    const defsObj = (wordData && wordData.definitions) || null;
    // [dictionary name, definitions] in display order.
    const sources = !defsObj ? [] : sourceOrder
        ? sourceOrder.filter((name) => name in defsObj).map((name) => [name, defsObj[name]])
        : Object.entries(defsObj);

    // On word change: reset, then load this user's votes for the word.
    React.useEffect(() => {
        setSourceOrder(null);
        setVotesLoaded(false);
        setSourceVotes({});
        if (!currentWord || auth === '') { setVotesLoaded(true); return; }
        let cancelled = false;
        fetchSourceVotes(currentWord).then((v) => {
            if (cancelled) return;
            setSourceVotes(v || {});
            setVotesLoaded(true);
        });
        return () => { cancelled = true; };
    }, [currentWord, auth]);

    // Freeze the source order ONCE per word, once both the definitions and the
    // votes are available. Liked (+1) first, disliked (-1) last, others in
    // original order between (a stable sort preserves ties).
    React.useEffect(() => {
        if (sourceOrder || !votesLoaded || !defsObj) return;
        const names = Object.keys(defsObj);
        if (names.length === 0) return;
        const rank = (src) => (sourceVotes[src] === 1 ? 0 : sourceVotes[src] === -1 ? 2 : 1);
        const ordered = names
            .map((name, i) => ({ name, i }))
            .sort((a, b) => rank(a.name) - rank(b.name) || a.i - b.i)
            .map((x) => x.name);
        setSourceOrder(ordered);
    }, [defsObj, votesLoaded, sourceOrder, sourceVotes]);

    // Toggle a source's thumb (click the active one again to clear). Updates the
    // highlight immediately; the order is untouched until the next load.
    const voteSource = (source, vote) => {
        const next = sourceVotes[source] === vote ? 0 : vote;
        setSourceVotes((prev) => {
            const copy = { ...prev };
            if (next === 0) delete copy[source]; else copy[source] = next;
            return copy;
        });
        setSourceVote(currentWord, source, next);
    };

    // The note belongs to this word only if it was fetched for it.
    const noteContent = wordNote && wordNote.word === currentWord ? wordNote.content : null;
    const hasNote = !!noteContent && !isEmptyHtml(noteContent);

    // Render KaTeX math inside the word note after it's in the DOM.
    const noteRef = React.useRef(null);
    React.useEffect(() => { renderMathIn(noteRef.current); });

    // Saving the note waits for the server: on failure the editor stays open
    // with the text and a "Try again", and the text is kept on this device
    // until it's saved (useDraft; offered back next time if it never was).
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteError, setNoteError] = useState('');
    const [noteEditorKey, setNoteEditorKey] = useState(0);
    const noteDraftStore = useDraft(editingNote && currentWord ? `wordnote:${currentWord}` : null,
        noteDraft, noteContent || '');

    const startAddNote = () => { setNoteDraft(''); setNoteError(''); setEditingNote(true); };
    const startEditNote = () => { setNoteDraft(noteContent || ''); setNoteError(''); setEditingNote(true); };
    const onSaveNote = async () => {
        if (noteSaving) return;
        setNoteSaving(true);
        setNoteError('');
        try {
            if (isEmptyHtml(noteDraft)) {
                if (hasNote) await deleteWordNote(currentWord);
            } else {
                await saveWordNote(currentWord, noteDraft);
            }
            noteDraftStore.clear();
            setEditingNote(false);
        } catch (err) {
            setNoteError(requestErrorMessage(err, "Couldn't save your note."));
        }
        setNoteSaving(false);
    };
    const onCancelNote = () => { noteDraftStore.clear(); setNoteError(''); setEditingNote(false); };
    const restoreNoteDraft = () => {
        const value = noteDraftStore.takeRestorable();
        if (typeof value === 'string') { setNoteDraft(value); setNoteEditorKey((k) => k + 1); }
    };
    const onDeleteNote = () => { deleteWordNote(currentWord); setEditingNote(false); };

    // Render any KaTeX math in the card body after the HTML is in the DOM.
    const cardRef = React.useRef(null);
    React.useEffect(() => {
        renderMathIn(cardRef.current);
    });

    // Reset the delete confirmation and note editor whenever the selection changes.
    React.useEffect(() => {
        setConfirmingDelete(false);
        setEditingNote(false);
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
    const cardForThis = isCard && currentCard != null && currentCard.card_id === currentWord;
    const cardLoadError = cardForThis && currentCard.loadError ? currentCard.loadError : null;
    const cardReady = cardForThis && !cardLoadError;

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
        if (cardLoadError) {
            return (
                <div className="search-result">
                    <LoadError message={cardLoadError} onRetry={() => fetchCardData(currentWord)} />
                </div>
            );
        }
        if (!cardReady) {
            return <div className="search-result"><Spinner label="Loading note…" /></div>;
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

                <ItemTags type="card" id={currentCard.card_id} title={currentCard.title} />

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
                                    getChunks={() => {
                                        // Read the word, then your note (if any), then the dictionary
                                        // definitions — matching the order shown on screen.
                                        const defs = htmlToPlainText(
                                            sources.map(([, list]) => list).flat().join(' '));
                                        return [
                                            ...textToChunks(`${currentWord}.`),
                                            ...(hasNote ? htmlToChunks(noteContent) : []),
                                            ...textToChunks(defs),
                                        ];
                                    }} />
                                {auth != "" && !hasNote && !editingNote && (
                                    <button className="card-tool" title="Add note" aria-label="Add note"
                                        onClick={startAddNote}>
                                        <i className="sticky note outline icon"></i>
                                    </button>
                                )}
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
                        <ItemTags type="word" id={currentWord} title={currentWord} />
                    </>
                    : ""}

                {/* Your personal note for this word, shown above the dictionary
                    definitions. Hidden entirely when there's no note. */}
                {currentWord != "" && editingNote ? (
                    <div className="word-note word-note--edit">
                        <div className="word-note__label">Your note</div>
                        {noteDraftStore.restorable && (
                            <div className="card-editor__restore" role="status">
                                <span>You have unsaved changes to this note from {timeAgo(noteDraftStore.restorable.at)}.</span>
                                <button type="button" className="cb-btn cb-btn--accent" onClick={restoreNoteDraft}>Restore</button>
                                <button type="button" className="cb-btn" onClick={noteDraftStore.discard}>Discard</button>
                            </div>
                        )}
                        <RichTextEditor key={noteEditorKey} value={noteDraft} onChange={setNoteDraft} />
                        {noteError && (
                            <div className="card-editor__error" role="alert">
                                <span>{noteError} Your text is kept on this device until it's saved.</span>
                            </div>
                        )}
                        <div className="word-note__actions">
                            <button className="cb-btn cb-btn--ghost" onClick={onCancelNote} disabled={noteSaving}>Cancel</button>
                            <button className="cb-btn cb-btn--accent" onClick={onSaveNote} disabled={noteSaving}>
                                {noteSaving ? 'Saving…' : noteError ? 'Try again' : 'Save'}
                            </button>
                        </div>
                    </div>
                ) : currentWord != "" && hasNote ? (
                    <div className="word-note">
                        <div className="word-note__head">
                            <span className="word-note__label">Your note</span>
                            <span className="word-note__tools">
                                <button className="card-tool" title="Edit note" aria-label="Edit note"
                                    onClick={startEditNote}><i className="edit icon"></i></button>
                                <button className="card-tool card-tool--danger" title="Delete note" aria-label="Delete note"
                                    onClick={onDeleteNote}><i className="trash alternate outline icon"></i></button>
                            </span>
                        </div>
                        <div className="word-note__content" ref={noteRef}
                            dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(noteContent) }} />
                    </div>
                ) : null}

                {currentWord == "" ? null : !wordData ? (
                    <Spinner label={`Looking up “${currentWord}”…`} />
                ) : wordData.Error ? (
                    wordData.retryable
                        ? <LoadError message={wordData.Error} onRetry={() => fetchWordData(currentWord)} />
                        : <div className="search-result__error">{wordData.Error}</div>
                ) : null}

                {sources.length === 0 ? "" :
                    sources.map(([k, v]) => (
                        <div key={k}>
                            <div className="source-dictionary-row">
                                <em className="source-dictionary">{k}</em>
                                {auth != "" && (
                                    <span className="source-vote">
                                        <button type="button"
                                            className={`source-vote__btn${sourceVotes[k] === 1 ? ' on-up' : ''}`}
                                            title="Like this source — sorts to the top next time you open the word"
                                            aria-label="Like this source" aria-pressed={sourceVotes[k] === 1}
                                            onClick={() => voteSource(k, 1)}>
                                            <i className="thumbs up outline icon"></i>
                                        </button>
                                        <button type="button"
                                            className={`source-vote__btn${sourceVotes[k] === -1 ? ' on-down' : ''}`}
                                            title="Dislike this source — sorts to the bottom next time you open the word"
                                            aria-label="Dislike this source" aria-pressed={sourceVotes[k] === -1}
                                            onClick={() => voteSource(k, -1)}>
                                            <i className="thumbs down outline icon"></i>
                                        </button>
                                    </span>
                                )}
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

            {currentWord != "" && wordData && Array.isArray(wordData.images) && (
                <WordImages word={currentWord} images={wordData.images} />
            )}
        </>
    );
}

function mapStatetoProps({ auth, currentWord, currentWordType, currentCard, word, wordbooks, wordNote }, ownProps) {
    return { auth, currentWord, currentWordType, currentCard, wordSearchResult: word, wordbooks, wordNote };
}

export default connect(mapStatetoProps, { fetchWordWordbooks, fetchWordbooks, openCardEditor, deleteCard, saveWordNote, deleteWordNote, fetchSourceVotes, setSourceVote, fetchWordData, fetchCardData })(SearchResult);
