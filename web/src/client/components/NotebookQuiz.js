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
import { ITEM_COLORS } from '../utils/itemColors';
import { canAnswerBySpeech, listenForAnswer, stopListening, sayReply } from '../native/speech';
import { isRightAnswer } from '../utils/answerCheck';
import { runKey, cardKey, loadRun, saveRun, scoreOf } from '../utils/quizResults';

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
//
// Spoken answers (iPhone app only, native/speech.js). Under the front of a
// card, "🎤 Say it": say the hidden side; it stops listening when you pause.
// Nothing is marked yet — you see what it heard, then
//
//   Heard: “I'm”            [🎤 Again]  [✓ Check]
//
// Again replaces the answer; Check marks it (utils/answerCheck.js), says
// "Correct" or "Not quite", and that's what the score counts: one answer per
// card per run, so retrying until it says Correct isn't possible. After
// Check, 🎤 is only practice. Skipping a card (Next without Check) leaves it
// unanswered. "Score" in the header shows correct ÷ answered × 100 only when
// asked, with Start over (utils/quizResults.js keeps a saved quiz's run).
const SOURCE = 'quiz';

/**
 * Put text on the clipboard (the card's Copy button). navigator.clipboard
 * where it's allowed; otherwise the older way, a hidden text box and the
 * browser's Copy command (older iPhones).
 * @param {string} text
 */
async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text); return; } catch (e) { /* the older way */ }
    }
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    Object.assign(box.style, { position: 'fixed', top: '0', opacity: '0', fontSize: '16px' });
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    if (!ok) throw new Error('Copy failed');
}

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
    const [copied, setCopied] = useState(''); // '' | 'done' | 'failed': the Copy button's tick
    const [coloring, setColoring] = useState(false); // the card's colour choices are open
    const [run, setRun] = useState({}); // this run's checked answers, by card (utils/quizResults.js)
    // The card's spoken answer before Check (or a practice one after it):
    // { status: 'listening'|'heard'|'error', text, practice?, correct?, error? }
    const [answer, setAnswer] = useState(null);
    const [showScore, setShowScore] = useState(false);
    const latest = useRef(null); // the quiz being loaded (a newer one wins)
    const listeningFor = useRef(null); // the card key being listened for, while listening

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
        setRun({});
        setAnswer(null);
        setShowScore(false);
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
    // Stop hearing an answer that's no longer wanted (its result is ignored).
    const stopHearing = () => {
        if (!listeningFor.current) return;
        listeningFor.current = null;
        stopListening().catch(() => {});
    };
    const close = () => {
        stopAudio();
        stopHearing();
        latest.current = null;
        setQuiz(null);
    };

    const showing = !!quiz && !away;
    useEffect(() => {
        if (!showing) return undefined;
        const onKey = (e) => {
            if (e.key !== 'Escape' || naming !== null) return;
            if (showScore) setShowScore(false);
            else close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    // The tick goes back to the copy icon, and the colour choices close, on
    // another card or side. An answer not yet checked is dropped (and
    // listening stops): it belonged to that card's front.
    useEffect(() => {
        setCopied('');
        setColoring(false);
        setAnswer(null);
        stopHearing();
    }, [index, flipped]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setRun(loadRun(runKey(saved, english)));
        setIndex(0);
        setFlipped(false);
        say(sideOf(cards[0], false, english));
    };
    const flip = () => {
        setFlipped(!flipped);
        say(sideOf(cards[index], !flipped));
    };
    // Copy the side showing. Its own tap: the card doesn't flip.
    const copy = (e, text) => {
        e.stopPropagation();
        copyText(text).then(() => setCopied('done'), () => setCopied('failed'));
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

    // ---- Spoken answers (iPhone app) ----
    // The answer to the card's front is its other side.
    const answerTo = (c) => sideOf(c, true);
    const runStore = () => runKey(saved, toEnglish);

    // 🎤: hear an answer for this card (tapping it while listening stops).
    // Before Check it's only shown; after Check it's practice, marked at once.
    const listen = async () => {
        if (listeningFor.current) { stopListening().catch(() => {}); return; }
        const c = cards[index];
        const key = cardKey(c);
        const target = answerTo(c);
        const practice = !!run[key];
        stopAudio(); // so the card's own audio isn't heard as the answer
        listeningFor.current = key;
        setAnswer({ status: 'listening', text: '', practice });
        try {
            const text = await listenForAnswer(target.lang, [target.text], (words) => {
                if (listeningFor.current === key) setAnswer((a) => (a && a.status === 'listening' ? { ...a, text: words } : a));
            });
            if (listeningFor.current !== key) return;
            if (practice) {
                const correct = isRightAnswer(text, target.text, target.lang);
                setAnswer({ status: 'heard', text, practice, correct });
                if (text) sayReply(correct ? 'Correct' : 'Not quite');
            } else {
                setAnswer({ status: 'heard', text });
            }
        } catch (err) {
            if (listeningFor.current !== key) return;
            const code = err && err.code;
            setAnswer({
                status: 'error', text: '', practice,
                error: code === 'DENIED' ? 'Remembrancer isn’t allowed to use the microphone or speech recognition. You can turn them on in Settings → Remembrancer.'
                    : code === 'UNAVAILABLE' ? 'Your iPhone can’t recognise this language right now.'
                        : code === 'UNIMPLEMENTED' ? 'Update the app to answer by speaking.'
                            : 'Couldn’t listen. Try again.',
            });
        } finally {
            if (listeningFor.current === key) listeningFor.current = null;
        }
    };

    // ✓ Check: mark the answer; this is the one the score counts.
    const check = () => {
        const c = cards[index];
        const target = answerTo(c);
        const correct = isRightAnswer(answer.text, target.text, target.lang);
        const nextRun = { ...run, [cardKey(c)]: { heard: answer.text, correct } };
        setRun(nextRun);
        saveRun(runStore(), nextRun);
        setAnswer(null);
        sayReply(correct ? 'Correct' : 'Not quite');
    };

    // Score › Start over: forget this run's answers and begin at card 1.
    const startOver = () => {
        setRun({});
        saveRun(runStore(), {});
        setShowScore(false);
        setAnswer(null);
        goTo(0);
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
            saveRun(runKey(entry, toEnglish), run); // the answers so far stay with it
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

    // Colour this card (one of the notes' colours, utils/itemColors.js), or
    // none. It belongs to this quiz's card, not the note: kept in the card,
    // so a saved quiz saves it (again, like Remove).
    const setCardColor = (e, key) => {
        e.stopPropagation();
        setColoring(false);
        const list = cards.map((c, i) => {
            if (i !== index) return c;
            const { color, ...rest } = c;
            return key ? { ...rest, color: key } : rest;
        });
        setLoaded({ ...loaded, cards: list });
        if (saved) {
            setSaveError('');
            store(saved, list).catch(() => setSaveError('Couldn’t save the change to this quiz. Check your connection.'));
        }
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
    // The card's own colour, if it was given one ({ key, label, tint, ink }).
    const cardColor = card && card.color ? ITEM_COLORS.find((c) => c.key === card.color) || null : null;
    const last = index + 1 >= cards.length;

    // Under the front of the card (iPhone app): 🎤, what was heard, Again /
    // Check, and once checked, the mark.
    const answerRow = () => {
        const target = answerTo(card);
        const result = run[cardKey(card)];
        const mic = (label, extra = '') => (
            <button type="button" className={`quiz__mic${extra}`} onClick={listen}>
                <i className="microphone icon" aria-hidden="true"></i>{label}
            </button>
        );
        const mark = (correct) => (correct
            ? <span className="quiz__mark quiz__mark--right"><i className="check icon" aria-hidden="true"></i>Correct</span>
            : <span className="quiz__mark quiz__mark--wrong"><i className="times icon" aria-hidden="true"></i>Not quite</span>);
        const heardLine = (text) => (text
            ? <div className="quiz__heard">Heard: <span lang={target.lang}>“{text}”</span></div>
            : <div className="quiz__heard quiz__heard--none">Didn’t catch that.</div>);

        if (answer && answer.status === 'listening') {
            return (
                <div className="quiz__answer" aria-live="polite">
                    {mic('Listening… tap to stop', ' quiz__mic--on')}
                    {answer.text && heardLine(answer.text)}
                </div>
            );
        }
        if (answer && answer.status === 'error') {
            return (
                <div className="quiz__answer">
                    <div className="quiz__heard quiz__heard--none">{answer.error}</div>
                    {mic('Try again')}
                </div>
            );
        }
        if (answer && !answer.practice) {
            return (
                <div className="quiz__answer" aria-live="polite">
                    {heardLine(answer.text)}
                    <div className="quiz__answerbtns">
                        {mic('Again', ' quiz__mic--small')}
                        <button type="button" className="cb-btn cb-btn--accent quiz__check" onClick={check}
                            disabled={!answer.text}>
                            <i className="check icon" aria-hidden="true"></i>Check
                        </button>
                    </div>
                </div>
            );
        }
        if (result) {
            const shown = answer && answer.practice ? answer : null; // a practice try after Check
            return (
                <div className="quiz__answer" aria-live="polite">
                    {heardLine(result.heard)}
                    <div className="quiz__result">
                        {mark(result.correct)}
                        {!result.correct && <span className="quiz__solution">Answer: <span lang={target.lang}>{target.text}</span></span>}
                    </div>
                    {shown && (
                        <div className="quiz__practice">
                            Practice: {shown.text ? <>“<span lang={target.lang}>{shown.text}</span>” {mark(shown.correct)}</> : 'didn’t catch that.'}
                        </div>
                    )}
                    {mic('Practise', ' quiz__mic--small')}
                </div>
            );
        }
        return <div className="quiz__answer">{mic('Say it')}</div>;
    };

    const scoreSheet = () => {
        const s = scoreOf(run, cards);
        return (
            <div className="cb-sheet__overlay quiz-score__overlay" onMouseDown={() => setShowScore(false)}>
                <div className="cb-sheet quiz-score" role="dialog" aria-modal="true" aria-label="Quiz score"
                    onMouseDown={(e) => e.stopPropagation()}>
                    <div className="cb-sheet__head">
                        <h3 className="cb-sheet__title">Quiz score</h3>
                        <button type="button" className="a2c__close" aria-label="Close" onClick={() => setShowScore(false)}>
                            <i className="times icon"></i>
                        </button>
                    </div>
                    {s.score === null ? (
                        <div className="quiz-score__line">No answers checked yet. Tap Say it on a card, then Check.</div>
                    ) : (
                        <>
                            <div className="quiz-score__big">{s.score}<span className="quiz-score__of"> / 100</span></div>
                            <div className="quiz-score__line">{s.correct} correct of {s.answered} answered</div>
                        </>
                    )}
                    <div className="quiz-score__line quiz-score__total">({s.total} card{s.total === 1 ? '' : 's'} in this quiz)</div>
                    <div className="quiz-score__btns">
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={startOver} disabled={!s.answered}>
                            Start over
                        </button>
                        <button type="button" className="cb-btn cb-btn--accent" onClick={() => setShowScore(false)}>Close</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="quiz__overlay">
            <div className="quiz" role="dialog" aria-modal="true" aria-label={`Quiz on ${title}`}>
                <div className="quiz__head">
                    <span className="quiz__count">{card ? `${index + 1} of ${cards.length}` : 'No cards left'}</span>
                    <span className="quiz__headbtns">
                        {card && canAnswerBySpeech() && (
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setShowScore(true)}>
                                <i className="chart bar outline icon" aria-hidden="true"></i>Score
                            </button>
                        )}
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
                        {/* A tappable box rather than a button, so the Copy
                            button can sit beside the text (a button can't
                            hold another one). */}
                        <div role="button" tabIndex={0} className={`quiz__card${flipped ? ' quiz__card--back' : ''}`}
                            style={cardColor ? { background: cardColor.tint, borderColor: cardColor.ink } : undefined}
                            data-color={cardColor ? cardColor.key : undefined}
                            onClick={flip}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}>
                            <span className="quiz__textrow">
                                <span className="quiz__text" lang={side.lang}>{side.text}</span>
                                <button type="button" className={`quiz__copy${copied ? ` quiz__copy--${copied}` : ''}`}
                                    aria-label="Copy the text" title={copied === 'failed' ? 'Couldn’t copy' : 'Copy the text'}
                                    onClick={(e) => copy(e, side.text)}>
                                    <i className={`${copied === 'done' ? 'check' : copied === 'failed' ? 'exclamation' : 'copy outline'} icon`}
                                        aria-hidden="true"></i>
                                </button>
                                <button type="button" className={`quiz__copy quiz__colorbtn${coloring ? ' on' : ''}`}
                                    aria-label="Colour this card" title="Colour this card" aria-expanded={coloring}
                                    onClick={(e) => { e.stopPropagation(); setColoring(!coloring); }}>
                                    <span className="quiz__dot" style={cardColor ? { background: cardColor.ink } : undefined}
                                        aria-hidden="true" />
                                </button>
                            </span>
                            {coloring && (
                                <span className="quiz__colors" role="group" aria-label="Card colour">
                                    {ITEM_COLORS.map((c) => (
                                        <button type="button" key={c.key} aria-label={c.label} title={c.label}
                                            aria-pressed={cardColor ? cardColor.key === c.key : false}
                                            className={`quiz__swatch${cardColor && cardColor.key === c.key ? ' on' : ''}`}
                                            style={{ background: c.ink }} onClick={(e) => setCardColor(e, c.key)} />
                                    ))}
                                    <button type="button" className="quiz__swatch quiz__swatch--none" aria-label="No colour"
                                        title="No colour" onClick={(e) => setCardColor(e, null)}>
                                        <i className="ban icon" aria-hidden="true"></i>
                                    </button>
                                </span>
                            )}
                            <span className="quiz__hint">tap to flip</span>
                        </div>
                        {/* Beside the card, not in it: tapping the card flips it. */}
                        <button type="button" className="quiz__again" aria-label="Read again" title="Read again"
                            onClick={() => say(side)}>
                            <i className="volume up icon" aria-hidden="true"></i>
                        </button>
                    </div>
                ) : (
                    <div className="quiz__empty">You removed every card.</div>
                )}
                {card && canAnswerBySpeech() && !flipped && answerRow()}
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
            {showScore && scoreSheet()}
        </div>
    );
}

export default NotebookQuiz;
