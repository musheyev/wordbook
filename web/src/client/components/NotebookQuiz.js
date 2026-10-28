import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import ttsPlayer from '../utils/ttsPlayer';
import { quizLanguage } from '../utils/quizCards';
import { onOpenQuiz, quizzesChanged, newQuizId } from '../utils/quizLauncher';
import { itemPath } from '../utils/notebookPaths';
import { noteLinkHref } from '../utils/noteLinks';
import { saveQuiz } from '../actions';
import Spinner from './Spinner';

// The quiz (admins): started by the Quiz buttons of a notebook, of a note
// (the note and the notes it links to), of a tag (Tags), or from My
// Quizzes. First a sheet to pick the direction, then one flash card at a time:
//
//   3 of 24                    Save    Stop     (✓ Saved once saved)
//
//                Yo estoy               🔊   read aloud when it opens; 🔊 reads
//              tap to flip                   it again. Flipped: "I am", in English
//            See note ›                      opens the note the card came from
//   🗑 Remove
//   ← Previous                      Next →     (Done on the last card)
//
// The cards come from the notes' "foreign — English" lines
// (utils/quizCards.js), in the notebook's order, or from a saved quiz's copy
// of them (api/quizzes.js). Everything it needs is on the phone once the
// notebook is downloaded, the audio too, so it works offline. Audio plays
// through ttsPlayer (the chosen voices and speeds), without bringing up the
// big player controls (PlayerPanel skips 'quiz').
//
// Remove drops a card from this quiz only (never from the note). Save keeps
// the cards left under a name in My Quizzes; once saved, each Remove saves
// again.
//
// Drawn once at the app's root (App.js) and opened with openQuiz()
// (utils/quizLauncher.js), so "See note" can leave for the note and a "Back to
// quiz" button brings back the same card.
const SOURCE = 'quiz';

function NotebookQuiz() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [quiz, setQuiz] = useState(null); // what openQuiz() was given; null: closed
    const [loaded, setLoaded] = useState(null); // { cards, missing }
    const [toEnglish, setToEnglish] = useState(true); // front: the foreign side
    const [index, setIndex] = useState(-1); // -1: choosing the direction
    const [flipped, setFlipped] = useState(false);
    const [audioError, setAudioError] = useState('');
    const [saved, setSaved] = useState(null); // { id, name } once in My Quizzes
    const [naming, setNaming] = useState(null); // the name being typed, while saving
    const [saveError, setSaveError] = useState('');
    const [away, setAway] = useState(false); // at a card's note; "Back to quiz" shows
    const latest = useRef(null); // the quiz being loaded (a newer one wins)

    // openQuiz(): start afresh with the new cards.
    useEffect(() => onOpenQuiz((next) => {
        if (ttsPlayer.snapshot().sourceId === SOURCE) ttsPlayer.stop();
        setQuiz(next);
        setLoaded(null);
        setIndex(-1);
        setFlipped(false);
        setAudioError('');
        setSaved(next.saved || null);
        setNaming(null);
        setSaveError('');
        setAway(false);
        latest.current = next;
        Promise.resolve(next.load())
            .then((r) => { if (latest.current === next) setLoaded(r); })
            .catch(() => { if (latest.current === next) setLoaded({ cards: [], missing: 0, failed: true }); });
    }), []);

    // Errors (offline, audio not downloaded) from the quiz's own playback.
    useEffect(() => ttsPlayer.subscribe((s) => {
        if (s.sourceId === SOURCE || s.status === 'idle') setAudioError(s.error || '');
    }), []);

    const stopAudio = () => {
        if (ttsPlayer.snapshot().sourceId === SOURCE) ttsPlayer.stop();
    };
    const close = () => {
        stopAudio();
        latest.current = null;
        setQuiz(null);
    };

    const showing = !!quiz && !away;
    useEffect(() => {
        if (!showing) return undefined;
        const onKey = (e) => { if (e.key === 'Escape' && naming === null) close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    if (!quiz) return null;

    const cards = loaded ? loaded.cards : [];
    const sideOf = (card, back, english = toEnglish) => ((english !== back) ? card.foreign : card.english);
    const title = saved ? saved.name : quiz.title;

    // Read a card's side. Called straight from the tap (iOS plays audio only
    // when it starts in a tap).
    const say = (side) => {
        setAudioError('');
        ttsPlayer.prime();
        ttsPlayer.play(side.chunks, { title: `${title} quiz`, sourceId: SOURCE });
    };

    const start = (english) => {
        setToEnglish(english);
        setIndex(0);
        setFlipped(false);
        say(sideOf(cards[0], false, english));
    };
    const flip = () => {
        setFlipped(!flipped);
        say(sideOf(cards[index], !flipped));
    };
    // Go to card i, front side up, and read it.
    const goTo = (i, list = cards) => {
        setIndex(i);
        setFlipped(false);
        say(sideOf(list[i], false));
    };
    const next = () => {
        if (index + 1 >= cards.length) { close(); return; }
        goTo(index + 1);
    };

    // Save to My Quizzes (a copy of these cards). Throws if it couldn't.
    const store = async (entry, list) => {
        await dispatch(saveQuiz({ id: entry.id, name: entry.name, notebook: quiz.notebook, cards: list }));
        quizzesChanged();
    };
    const saveAs = async (e) => {
        e.preventDefault();
        const name = naming.trim();
        if (!name) return;
        const entry = { id: newQuizId(), name };
        setSaveError('');
        try {
            await store(entry, cards);
            setSaved(entry);
            setNaming(null);
        } catch (err) {
            setSaveError('Couldn’t save the quiz. Check your connection and try again.');
        }
    };

    // Drop this card from the quiz (the note keeps its line), and show the
    // next one (the one before, if it was the last).
    const remove = () => {
        const list = cards.filter((c, i) => i !== index);
        setLoaded({ ...loaded, cards: list });
        if (saved) {
            setSaveError('');
            store(saved, list).catch(() => setSaveError('Couldn’t save the change to this quiz. Check your connection.'));
        }
        if (!list.length) { stopAudio(); setAudioError(''); return; }
        goTo(Math.min(index, list.length - 1), list);
    };

    // "See note": go to the card's note, keeping the quiz for "Back to quiz".
    const openSource = (source) => {
        stopAudio();
        setAway(true);
        // A quiz from one notebook opens the note there; one across
        // notebooks (a note and its links, a tag) through the note's own
        // address, which finds a notebook that has it (pages/NoteLinkPage.js).
        navigate(quiz.notebook ? itemPath(quiz.notebook, source) : noteLinkHref(source.type, source.id));
    };
    const comeBack = () => {
        setAway(false);
        if (index >= 0 && cards[index]) say(sideOf(cards[index], flipped));
    };

    if (away) {
        return (
            <div className="quiz-back" role="region" aria-label="Quiz">
                <button type="button" className="quiz-back__go" onClick={comeBack}>
                    <i className="arrow left icon" aria-hidden="true"></i>Back to quiz
                </button>
                <button type="button" className="quiz-back__close" aria-label="End the quiz" title="End the quiz"
                    onClick={close}>
                    <i className="times icon" aria-hidden="true"></i>
                </button>
            </div>
        );
    }

    if (index < 0) {
        const lang = quizLanguage(cards);
        return (
            <div className="cb-sheet__overlay" onMouseDown={close}>
                <div className="cb-sheet" role="dialog" aria-modal="true" aria-label={`Quiz on ${title}`}
                    onMouseDown={(e) => e.stopPropagation()}>
                    <div className="cb-sheet__grab" aria-hidden="true" />
                    <div className="cb-sheet__head">
                        <h3 className="cb-sheet__title">
                            {saved ? saved.name : 'Quiz'}
                            {loaded && cards.length > 0 ? ` · ${cards.length} card${cards.length === 1 ? '' : 's'}` : ''}
                        </h3>
                        <button type="button" className="a2c__close" aria-label="Close" onClick={close}>
                            <i className="times icon"></i>
                        </button>
                    </div>
                    {!loaded ? (
                        <Spinner label="Finding cards…" />
                    ) : loaded.failed ? (
                        <div className="cb-sheet__error">Couldn't load the notes. Check your connection and try again.</div>
                    ) : cards.length === 0 ? (
                        <div className="add-sheet__hint">
                            {saved ? 'This quiz has no cards left.'
                                : `No foreign phrases with English found in ${quiz.notebook ? 'this notebook' : 'these notes'}.`}
                        </div>
                    ) : (
                        <div className="quiz-sheet__choices">
                            <button type="button" className="cb-btn cb-btn--accent" onClick={() => start(true)}>
                                {lang} → English
                            </button>
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => start(false)}>
                                English → {lang}
                            </button>
                        </div>
                    )}
                    {loaded && loaded.missing > 0 && (
                        <div className="add-sheet__hint">
                            {loaded.missing} note{loaded.missing === 1 ? ' isn’t' : 's aren’t'} downloaded, so {loaded.missing === 1 ? 'it’s' : 'they’re'} left out.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const card = cards[index];
    const side = card && sideOf(card, flipped);
    const last = index + 1 >= cards.length;

    return (
        <div className="quiz__overlay">
            <div className="quiz" role="dialog" aria-modal="true" aria-label={`Quiz on ${title}`}>
                <div className="quiz__head">
                    <span className="quiz__count">{card ? `${index + 1} of ${cards.length}` : 'No cards left'}</span>
                    <span className="quiz__headbtns">
                        {saved ? (
                            <span className="quiz__saved" title={`Saved in My Quizzes as “${saved.name}”`}>
                                <i className="check icon" aria-hidden="true"></i>Saved
                            </span>
                        ) : card && naming === null && (
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setNaming(`${quiz.title} quiz`)}>
                                <i className="save outline icon" aria-hidden="true"></i>Save
                            </button>
                        )}
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={close}>
                            <i className="stop icon" aria-hidden="true"></i>Stop
                        </button>
                    </span>
                </div>
                {naming !== null && (
                    <form className="quiz__name" onSubmit={saveAs}>
                        <label className="quiz__namelabel" htmlFor="quiz-name">Save in My Quizzes as</label>
                        <input id="quiz-name" className="quiz__nameinput" value={naming} maxLength={100} autoFocus
                            onChange={(e) => setNaming(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); } }} />
                        <span className="quiz__namebtns">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setNaming(null)}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={!naming.trim()}>Save</button>
                        </span>
                    </form>
                )}
                {card ? (
                    <div className="quiz__cardwrap">
                        <button type="button" className={`quiz__card${flipped ? ' quiz__card--back' : ''}`} onClick={flip}
                            aria-label={`${side.text}. Tap to flip`}>
                            <span className="quiz__text" lang={side.lang}>{side.text}</span>
                            <span className="quiz__hint">tap to flip</span>
                        </button>
                        {/* Beside the card, not in it: tapping the card flips it. */}
                        <button type="button" className="quiz__again" aria-label="Read again" title="Read again"
                            onClick={() => say(side)}>
                            <i className="volume up icon" aria-hidden="true"></i>
                        </button>
                    </div>
                ) : (
                    <div className="quiz__empty">You removed every card.</div>
                )}
                {card && card.source && (
                    <button type="button" className="quiz__from" onClick={() => openSource(card.source)}>
                        {/* Not the note's title: it could give the answer away. */}
                        <span className="quiz__fromname">See note</span>
                        <i className="angle right icon" aria-hidden="true"></i>
                    </button>
                )}
                {audioError && <div className="quiz__error">{audioError}</div>}
                {saveError && <div className="quiz__error">{saveError}</div>}
                <div className="quiz__foot">
                    {card ? (
                        <>
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => goTo(index - 1)}
                                disabled={index === 0}>
                                <i className="arrow left icon" aria-hidden="true"></i>Previous
                            </button>
                            <button type="button" className="quiz__remove" onClick={remove}
                                title="Remove this card from the quiz (the note keeps it)">
                                <i className="trash alternate outline icon" aria-hidden="true"></i>Remove
                            </button>
                            <button type="button" className="cb-btn cb-btn--accent" onClick={next}>
                                {last ? 'Done' : <>Next<i className="arrow right icon" aria-hidden="true"></i></>}
                            </button>
                        </>
                    ) : (
                        <button type="button" className="cb-btn cb-btn--accent quiz__done" onClick={close}>Done</button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default NotebookQuiz;
