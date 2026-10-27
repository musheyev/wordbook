import React, { useEffect, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { quizLanguage } from '../utils/quizCards';
import Spinner from './Spinner';

// The notebook quiz (admins; the Quiz button next to Add). First a sheet to
// pick the direction, then one flash card at a time:
//
//   3 of 24                         Stop
//
//                Yo estoy               🔊   read aloud when it opens; 🔊 reads
//              tap to flip                   it again. Flipped: "I am", in English
//
//   ← Previous                      Next →     (Done on the last card)
//
// The cards come from the notes' "foreign — English" lines
// (utils/quizCards.js), in the notebook's order. Everything it needs is
// on the phone once the notebook is downloaded, the audio too, so it works
// offline. Audio plays through ttsPlayer (the chosen voices and speeds),
// without bringing up the big player controls (PlayerPanel skips 'quiz').
//
// `getCards` returns { cards, missing }: missing = notes that couldn't be
// loaded (offline, not downloaded), left out.
const SOURCE = 'quiz';

function NotebookQuiz({ open, name, getCards, onClose }) {
    const [loaded, setLoaded] = useState(null); // { cards, missing }
    const [toEnglish, setToEnglish] = useState(true); // front: the foreign side
    const [index, setIndex] = useState(-1); // -1: choosing the direction
    const [flipped, setFlipped] = useState(false);
    const [audioError, setAudioError] = useState('');

    useEffect(() => {
        if (!open) return undefined;
        let live = true;
        setLoaded(null);
        setIndex(-1);
        Promise.resolve(getCards())
            .then((r) => { if (live) setLoaded(r); })
            .catch(() => { if (live) setLoaded({ cards: [], missing: 0, failed: true }); });
        return () => { live = false; };
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Errors (offline, audio not downloaded) from the quiz's own playback.
    useEffect(() => ttsPlayer.subscribe((s) => {
        if (s.sourceId === SOURCE || s.status === 'idle') setAudioError(s.error || '');
    }), []);

    // Leaving the quiz stops its audio.
    useEffect(() => {
        if (open) return undefined;
        if (ttsPlayer.snapshot().sourceId === SOURCE) ttsPlayer.stop();
        return undefined;
    }, [open]);

    const close = () => {
        if (ttsPlayer.snapshot().sourceId === SOURCE) ttsPlayer.stop();
        onClose();
    };

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const cards = loaded ? loaded.cards : [];
    const sideOf = (card, back, english = toEnglish) => ((english !== back) ? card.foreign : card.english);

    // Read a card's side. Called straight from the tap (iOS plays audio only
    // when it starts in a tap).
    const say = (side) => {
        setAudioError('');
        ttsPlayer.prime();
        ttsPlayer.play(side.chunks, { title: `${name} quiz`, sourceId: SOURCE });
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
    const goTo = (i) => {
        setIndex(i);
        setFlipped(false);
        say(sideOf(cards[i], false));
    };
    const next = () => {
        if (index + 1 >= cards.length) { close(); return; }
        goTo(index + 1);
    };

    if (index < 0) {
        const lang = quizLanguage(cards);
        return (
            <div className="cb-sheet__overlay" onMouseDown={close}>
                <div className="cb-sheet" role="dialog" aria-modal="true" aria-label={`Quiz on ${name}`}
                    onMouseDown={(e) => e.stopPropagation()}>
                    <div className="cb-sheet__grab" aria-hidden="true" />
                    <div className="cb-sheet__head">
                        <h3 className="cb-sheet__title">
                            Quiz{loaded && cards.length > 0 ? ` · ${cards.length} card${cards.length === 1 ? '' : 's'}` : ''}
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
                        <div className="add-sheet__hint">No foreign phrases with English found in this notebook.</div>
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
    const side = sideOf(card, flipped);
    const last = index + 1 >= cards.length;

    return (
        <div className="quiz__overlay">
            <div className="quiz" role="dialog" aria-modal="true" aria-label={`Quiz on ${name}`}>
                <div className="quiz__head">
                    <span className="quiz__count">{index + 1} of {cards.length}</span>
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={close}>
                        <i className="stop icon" aria-hidden="true"></i>Stop
                    </button>
                </div>
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
                {audioError && <div className="quiz__error">{audioError}</div>}
                <div className="quiz__foot">
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={() => goTo(index - 1)}
                        disabled={index === 0}>
                        <i className="arrow left icon" aria-hidden="true"></i>Previous
                    </button>
                    <button type="button" className="cb-btn cb-btn--accent" onClick={next}>
                        {last ? 'Done' : <>Next<i className="arrow right icon" aria-hidden="true"></i></>}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NotebookQuiz;
