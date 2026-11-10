import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import ttsPlayer from '../utils/ttsPlayer';
import { quizLanguage } from '../utils/quizCards';
import { onOpenQuiz, quizzesChanged, newQuizId } from '../utils/quizLauncher';
import { itemPath } from '../utils/notebookPaths';
import { noteLinkHref } from '../utils/noteLinks';
import { saveQuiz, requestStretchCards, requestSecondOpinion } from '../actions';
import Spinner from './Spinner';
import ConfirmDialog from './ConfirmDialog';
import { loadSpot, saveSpot, clearSpot } from '../utils/quizSpots';
import { ITEM_COLORS } from '../utils/itemColors';
import { canAnswerBySpeech, listenForAnswer, stopListening, sayReply, feel } from '../native/speech';
import { isRightAnswer } from '../utils/answerCheck';
import { runKey, cardKey, loadRun, saveRun, scoreOf } from '../utils/quizResults';
import {
    MIX_SHARES, lastShare, rememberShare, lastDirection, rememberDirection, dealDirections, loadDeal, saveDeal,
} from '../utils/quizMix';
import { roundsOf, roundAt, recordQuizDay, dayStreak } from '../utils/quizRounds';
import { languageLabel } from '../utils/tts';
import { isOnline } from '../offline/network';
import {
    QUIZ_KINDS, MAX_WRITTEN, PER_REQUEST, SECOND_OPINION, lastKind, rememberKind, lastCount, rememberCount,
    lastCardCount, rememberCardCount, lastSecondOpinion, rememberSecondOpinion, pickMaterial, cardsFromReply, stretchRounds, languageName,
} from '../utils/stretch';

// The quiz (admins): started by the Quiz buttons of a notebook, of a note
// (the note and the notes it links to), of a tag (Tags), or from My
// Quizzes. First a sheet of choices, then one Start:
//
//   Quiz · Spanish                       ✕
//   130 cards
//   Questions   [ My cards ] [ Remix ]          what the questions are
//               [ Conversation ] [ Street ]     (utils/stretch.js QUIZ_KINDS)
//   How many    [−] [ 10 ] [+]   [ All 130 ]
//   Answer in   [ English ] [ Spanish ] [ Mixed ]
//               (Mixed: [ 70/30 ] [ 50/50 ] [ 30/70 ])
//   Second opinion  [ Off ] [ Ask me ] [ Automatic ]   (iPhone)
//   [                Start                ]
//
// Every choice is remembered on this device for next time. Mixed asks some
// cards one way and the rest the other, in the share picked under it — 70 /
// 30 (mostly answered in English), 50 / 50 or 30 / 70 (utils/quizMix.js).
// Fewer than all your cards: that many, picked at random, in their order.
// Then one flash card at a time, in rounds of 20 (utils/quizRounds.js):
//
//   ✕  ━━━━━━──────────  3/20  ⋯       ✕ ends the quiz; ⋯ is the menu: Score,
//      Round 2 of 13                   Save, See note, Copy, card colour, Remove
//   ┌──────────────────────────┐
//   │    Spanish → English     │       which way this card is asked
//   │          Hola            │       read aloud when it opens
//   │           🔊             │       reads it again
//   └──────────────────────────┘       tap the card to flip it; swipe left for
//        ‹      (🎤)      ›            the next card, right for the one before
//          Say it in English
//
// The cards come from the notes' "foreign — English" lines
// (utils/quizCards.js), in the notebook's order, or from a saved quiz's copy
// of them (api/quizzes.js). Everything it needs is on the phone once the
// notebook is downloaded, the audio too, so it works offline. Audio plays
// through ttsPlayer (the chosen voices and speeds), without bringing up the
// big player controls (PlayerPanel skips 'quiz').
//
// Spoken answers (iPhone app only, native/speech.js): 🎤 listens until you
// pause, then the answer is marked at once (utils/answerCheck.js) — "Correct"
// or "Not quite", said aloud and felt as a buzz — and the card shows both
// sides. One answer per card counts for the score; "Try again" after that is
// practice. When it marked you wrong but you were right ("Hello" for "Hola"),
// "I was right" counts it and keeps what you said as another right answer for
// that card (the side's `also`), saved with the quiz like its colour.
//
// On the website (no microphone) the button under the card is "Show answer",
// then "Next".
//
// A quiz on one note asks all its cards in one round (each question once,
// sentences first: utils/quizCards.js oneNoteCards); other quizzes ask 20
// at a time. The end of each round shows its summary: the round's score (iPhone), the
// day streak, and "Review the N missed" (those cards again, as practice), then
// "Next round".
//
// Remove (in ⋯) drops a card from this quiz only (never from the note). Save
// keeps the cards left under a name in My Quizzes; once saved, each Remove,
// colour or "I was right" saves again.
//
// Remix, Conversation and Street (utils/stretch.js, api/stretch.js "Stretch"):
// the same quiz, but its cards are written by OpenAI's model from the notes
// (every line, the ones only in Spanish too), on Start — up to 50. A card
// can carry a scene above it ("At a café. The waiter asks: …") and, once
// answered, says whether it's from your notes or written for this quiz, and
// which words in it are new. "10 more" at the end writes another round.
// Needs a connection to start; once saved, it works offline. Written from a
// saved quiz, it's a new quiz: the saved one is left as it is.
//
// Second opinion (iPhone app, chosen on the sheet before starting: Off, Ask
// me, Automatic). The rules (utils/answerCheck.js) always mark first; only
// after "Not quite" is the model asked, by a button (Ask me) or at once
// (Automatic). If it says the answer is right, that's like "I was right":
// the answer is kept in the card's `also`, so next time the rules accept it
// with no need to ask (in a saved quiz, for good). A "no" is remembered while
// the quiz is open, so the same answer isn't asked about twice.
//
// Continue (utils/quizSpots.js): where you are in a quiz is kept on the
// phone, one per place it's started from (a notebook, tag, note or saved
// quiz; openQuiz's `spot`), with its cards, directions and answers. Next
// time the sheet offers "Continue where you left off" above the choices for
// a new one. Finishing the last round forgets it; starting a new one there
// replaces it. So ✕ (or Esc) in the middle asks first: "Leave the quiz?".
//
// Drawn once at the app's root (App.js) and opened with openQuiz()
// (utils/quizLauncher.js), so "See note" can leave for the note and a "Back to
// quiz" button brings back the same card.
const SOURCE = 'quiz';
// How far (px) a finger must move sideways to count as a swipe.
const SWIPE = 60;
// A phone or tablet (you swipe), not a computer (you use the arrow keys):
// for the hint on the first cards.
const touchScreen = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/**
 * Put text on the clipboard (⋯ › Copy). navigator.clipboard where it's
 * allowed; otherwise the older way, a hidden text box and the browser's Copy
 * command (older iPhones).
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

/**
 * The round summary's ring: how much of the round was right, as a circle
 * filled that far round.
 * @param {{percent: number|null, label: string}} props
 */
function ScoreRing({ percent, label }) {
    const r = 52;
    const around = 2 * Math.PI * r;
    return (
        <div className="quiz-ring" role="img" aria-label={label}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="quiz-ring__track" cx="60" cy="60" r={r} />
                {percent !== null && (
                    <circle className="quiz-ring__fill" cx="60" cy="60" r={r}
                        strokeDasharray={`${(around * percent) / 100} ${around}`} transform="rotate(-90 60 60)" />
                )}
            </svg>
            <span className="quiz-ring__label">{label}</span>
        </div>
    );
}

/**
 * "How many" on the quiz's sheet: − [ 10 ] + and, for your cards, All.
 * Typed numbers open the number keypad; one too big becomes the most there
 * can be, and an empty box goes back to the number when you leave it.
 *
 * @param {{value: number|'all', most: number, onChange: Function, all?: number}} props
 *        all: how many cards there are (shows the All button); 0 for none
 */
function HowMany({ value, most, onChange, all = 0 }) {
    const n = value === 'all' ? all : Math.min(value, most);
    const [text, setText] = useState(String(n));
    useEffect(() => { setText(String(n)); }, [n]);
    const set = (v) => onChange(Math.max(1, Math.min(most, v)));
    const isAll = !!all && (value === 'all' || n >= all);
    return (
        <div className="quiz-count">
            <button type="button" className="quiz-count__step" aria-label="Fewer" disabled={n <= 1} onClick={() => set(n - 1)}>
                <i className="minus icon" aria-hidden="true"></i>
            </button>
            <input className="quiz-count__input" type="text" inputMode="numeric" pattern="[0-9]*" aria-label="How many questions"
                value={text} onFocus={(e) => e.target.select()} onBlur={() => setText(String(n))}
                onChange={(e) => {
                    const t = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setText(t);
                    if (Number(t) >= 1) set(Number(t));
                }} />
            <button type="button" className="quiz-count__step" aria-label="More" disabled={n >= most} onClick={() => set(n + 1)}>
                <i className="plus icon" aria-hidden="true"></i>
            </button>
            {!!all && (
                <button type="button" role="switch" aria-checked={isAll}
                    className={`quiz-mix__share quiz-count__all${isAll ? ' on' : ''}`} onClick={() => onChange('all')}>
                    All {all}
                </button>
            )}
        </div>
    );
}

function NotebookQuiz() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [quiz, setQuiz] = useState(null); // what openQuiz() was given; null: closed
    const [loaded, setLoaded] = useState(null); // { cards, missing }
    // 'to-en' (front: the foreign side), 'from-en' (front: English), or
    // 'mixed': each card as `deal` says ({ <card key>: true = to English }),
    // dealt in the share picked (70: 70 of 100 cards to English).
    const [direction, setDirection] = useState(lastDirection);
    const [share, setShare] = useState(lastShare);
    const [deal, setDeal] = useState(null);
    const [index, setIndex] = useState(-1); // -1: choosing the direction
    const [flipped, setFlipped] = useState(false);
    // How the card came in, for its animation: 'flip', 'next' or 'prev'.
    const [motion, setMotion] = useState('next');
    const [summary, setSummary] = useState(null); // the round (0, 1, …) whose summary shows
    // Reviewing a round's missed cards: { round, list: [card positions], pos }.
    const [review, setReview] = useState(null);
    const [audioError, setAudioError] = useState('');
    const [saved, setSaved] = useState(null); // { id, name } once in My Quizzes
    const [naming, setNaming] = useState(null); // the name being typed, while saving
    const [saveError, setSaveError] = useState('');
    const [away, setAway] = useState(false); // at a card's note; "Back to quiz" shows
    const [menu, setMenu] = useState(false); // ⋯ is open
    const [copied, setCopied] = useState(''); // '' | 'done' | 'failed': ⋯ › Copy's tick
    const [run, setRun] = useState({}); // this run's checked answers, by card (utils/quizResults.js)
    // The card's spoken answer while it's heard, or a practice one:
    // { status: 'listening'|'heard'|'error', text, practice?, correct?, marked?, error? }
    const [answer, setAnswer] = useState(null);
    const [showScore, setShowScore] = useState(false);
    // Where you left off last time in a quiz from here (utils/quizSpots.js;
    // null: none), and whether "Leave the quiz?" is asking.
    const [spotFound, setSpotFound] = useState(null);
    const [leaving, setLeaving] = useState(false);
    // The sheet's kind of question (QUIZ_KINDS: 0 My cards, 1–3 written),
    // how many to write (count) or to ask of My cards (cardCount: 'all' or
    // a number), whether this quiz's cards were written, and whether cards
    // are being written (on Start or "10 more") or that failed.
    const [kind, setKind] = useState(lastKind);
    const [count, setCount] = useState(lastCount);
    const [cardCount, setCardCount] = useState(lastCardCount);
    const [written, setWritten] = useState(false);
    const [writing, setWriting] = useState(false);
    const [writeError, setWriteError] = useState('');
    // Second opinion: 'off' | 'ask' | 'auto' (SECOND_OPINION), and the one
    // being asked or answered for the showing card:
    // { key, heard, status: 'asking'|'wrong'|'error', why?, error? }
    const [secondMode, setSecondMode] = useState(lastSecondOpinion);
    const [opinion, setOpinion] = useState(null);
    const verdicts = useRef(new Map()); // "no" verdicts while the quiz is open
    // The latest cards and answers, for code that finishes after a wait (a
    // second opinion): what it captured when it started may be out of date.
    const now = useRef({});
    const latest = useRef(null); // the quiz being loaded (a newer one wins)
    // A saved quiz started on some of its cards: all of them, so a change
    // (Remove, colour, I was right) is saved into the whole quiz.
    const allCards = useRef(null);
    const listeningFor = useRef(null); // the card key being listened for, while listening
    const touch = useRef(null); // where a finger went down on the card { x, y }
    const swiped = useRef(false); // that touch was a swipe, so its tap doesn't flip

    // openQuiz(): start afresh with the new cards.
    useEffect(() => onOpenQuiz((next) => {
        if (ttsPlayer.snapshot().sourceId === SOURCE) ttsPlayer.stop();
        setQuiz(next);
        setLoaded(null);
        setIndex(-1);
        setDirection(lastDirection());
        setFlipped(false);
        setSummary(null);
        setReview(null);
        setAudioError('');
        setSaved(next.saved || null);
        setNaming(null);
        setSaveError('');
        setAway(false);
        setMenu(false);
        setRun({});
        setAnswer(null);
        setShowScore(false);
        setKind(lastKind());
        setCount(lastCount());
        setCardCount(lastCardCount());
        setWritten(false);
        allCards.current = null;
        setWriting(false);
        setWriteError('');
        setSecondMode(lastSecondOpinion());
        setOpinion(null);
        setSpotFound(loadSpot(next.spot));
        setLeaving(false);
        verdicts.current = new Map();
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
        setLeaving(false);
        setQuiz(null);
    };

    // The card showing: its position in `cards` (in a review, the missed
    // card the review is at).
    const cur = review ? review.list[review.pos] : index;

    // An answer being heard or practised belongs to that card and side: it's
    // dropped (and listening stops) on another one, and ⋯ closes.
    useEffect(() => {
        setCopied('');
        setMenu(false);
        setAnswer(null);
        setOpinion(null);
        stopHearing();
    }, [cur, flipped, summary]); // eslint-disable-line react-hooks/exhaustive-deps

    const showing = !!quiz && !away;
    useEffect(() => {
        if (!showing) return undefined;
        const onKey = (e) => {
            if (naming !== null || leaving) return; // "Leave the quiz?" handles its own keys
            if (e.key === 'Escape') {
                if (menu) setMenu(false);
                else if (showScore) setShowScore(false);
                else requestClose(); // eslint-disable-line no-use-before-define
            } else if (index >= 0 && summary === null && !menu && !showScore) {
                if (e.key === 'ArrowRight') next(); // eslint-disable-line no-use-before-define
                if (e.key === 'ArrowLeft') previous(); // eslint-disable-line no-use-before-define
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep where you are (utils/quizSpots.js) whenever it changes; at the
    // last round's summary the quiz is finished, so its spot is forgotten.
    useEffect(() => {
        if (!quiz || !quiz.spot || index < 0 || !loaded) return;
        const list = loaded.cards;
        const all = written ? stretchRounds(list) : quiz.oneGo ? [[0, list.length]] : roundsOf(list.length);
        if (!list.length || (summary !== null && summary + 1 >= all.length)) {
            clearSpot(quiz.spot);
            return;
        }
        saveSpot(quiz.spot, {
            cards: list,
            index,
            summary: summary !== null ? summary : review ? review.round : null,
            direction, share, deal, run,
            kind: written ? kind : 0,
            written,
            saved,
            subset: !!allCards.current,
        });
    }, [quiz, loaded, index, summary, review, direction, share, deal, run, kind, written, saved]);

    if (!quiz) return null;

    const cards = loaded ? loaded.cards : [];
    // Rounds of 20 (utils/quizRounds.js), one round of them all for a quiz
    // on one note (openQuiz's `oneGo`), or for a written quiz, by batch.
    const rounds = written ? stretchRounds(cards) : quiz.oneGo ? [[0, cards.length]] : roundsOf(cards.length);
    // Whether a card is asked to English (its front is the foreign side).
    const toEnglishFor = (card, dir = direction, d = deal) => (dir === 'mixed' ? !d || d[cardKey(card)] !== false : dir === 'to-en');
    const sideOf = (card, back, english = toEnglishFor(card)) => ((english !== back) ? card.foreign : card.english);
    // This test's name for its kept answers (utils/quizResults.js).
    const runName = direction === 'mixed' ? `mixed-${share}` : direction;
    const title = saved ? saved.name : quiz.title;
    const speech = canAnswerBySpeech();
    // Whether there's a connection (offline/network.js; a request can still fail).
    const online = isOnline;
    const secondOn = speech && secondMode !== 'off';
    now.current = { cards, run, loaded, curKey: cur >= 0 && cards[cur] ? cardKey(cards[cur]) : null };

    // Read a card's side. Called straight from the tap (iOS plays audio only
    // when it starts in a tap).
    const say = (side) => {
        setAudioError('');
        ttsPlayer.prime();
        ttsPlayer.play(side.chunks, { title: `${title} quiz`, sourceId: SOURCE });
    };

    // Show card i (a position in `cards`), front side up, and read it.
    // how: 'next' or 'prev', the way it slides in; d: a deal just made.
    const show = (i, how = 'next', list = cards, d = deal) => {
        setFlipped(false);
        setMotion(how);
        say(sideOf(list[i], false, toEnglishFor(list[i], direction, d)));
    };
    // dir: 'to-en', 'from-en' or 'mixed' (in the share picked on the sheet).
    // list: the cards (some of them, or a written quiz's, just written).
    // entry: the saved quiz they're from (null for a new, written one).
    const start = (dir, list = cards, entry = saved) => {
        let d = null;
        if (dir === 'mixed') {
            rememberShare(share);
            d = loadDeal(entry, share, list); // a saved quiz asks each card the same way again
            saveDeal(entry, share, d);
        }
        setDirection(dir);
        setDeal(d);
        setRun(loadRun(runKey(entry, dir === 'mixed' ? `mixed-${share}` : dir)));
        setIndex(0);
        setFlipped(false);
        setMotion('next');
        say(sideOf(list[0], false, toEnglishFor(list[0], dir, d)));
    };

    // ---- Written quizzes: writing cards ----
    // The same question twice (two requests at once may write it) is asked once.
    const plainQuestion = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    /**
     * Have the server write n cards, PER_REQUEST at a time, side by side
     * (20 is two requests, each from a different random part of the notes).
     * @param {number} n how many
     * @param {string[]} avoid questions already asked
     * @param {number} batch the round they'll make
     * @returns {Promise<Array>} quiz cards
     */
    const writeCards = async (n, avoid, batch) => {
        const material = loaded.material;
        const sizes = [];
        for (let left = n; left > 0; left -= PER_REQUEST) sizes.push(Math.min(PER_REQUEST, left));
        const lists = await Promise.all(sizes.map(async (size) => {
            const sent = pickMaterial(material.notes);
            const reply = await dispatch(requestStretchCards({
                notes: sent.map((note) => ({ title: note.title, lines: note.lines })),
                language: languageName(material.lang),
                level: kind,
                count: size,
                avoid,
            }));
            return cardsFromReply(reply, sent, material, kind, batch);
        }));
        const seen = new Set(avoid.map(plainQuestion));
        return lists.flat().filter((c) => {
            const k = plainQuestion(c.foreign.text);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    };
    // Start on a written kind: write the cards, then start. It's a new quiz,
    // not the saved one it may be written from (that one stays as it was).
    const startWritten = async (n) => {
        if (writing) return;
        ttsPlayer.prime(); // in the tap, so iOS lets the first card be read aloud
        setWriting(true);
        setWriteError('');
        try {
            const list = await writeCards(n, [], 1);
            if (latest.current !== quiz) return; // closed or replaced meanwhile
            if (!list.length) throw new Error('No questions came back. Try again.');
            setLoaded({ ...loaded, cards: list });
            setSaved(null);
            setWritten(true);
            start(direction, list, null);
        } catch (err) {
            if (latest.current === quiz) setWriteError(err.message);
        } finally {
            if (latest.current === quiz) setWriting(false);
        }
    };
    /**
     * Some of the cards, picked at random, in their order.
     * @param {Array} list
     * @param {number} n how many (all of them when n ≥ their number)
     */
    const someOf = (list, n) => {
        if (n >= list.length) return list;
        const order = list.map((c, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        return order.slice(0, n).sort((a, b) => a - b).map((i) => list[i]);
    };
    // Start, from the sheet, with what's picked on it (and remember it all).
    // k: the kind (0 My cards; 1–3 written); n: how many. Without a
    // connection there's no second opinion this time.
    const go = (k, n) => {
        if (k > 0 && !online()) { setWriteError('Writing questions needs a connection.'); return; }
        if (!online()) setSecondMode('off');
        rememberKind(k);
        rememberDirection(direction);
        if (k > 0) {
            rememberCount(n);
            startWritten(n);
            return;
        }
        rememberCardCount(cardCount);
        const list = someOf(cards, n);
        if (list !== cards) {
            allCards.current = cards;
            setLoaded({ ...loaded, cards: list });
        }
        start(direction, list);
    };
    // Continue: back to where you left off (spotFound), with its cards,
    // directions and answers; at a round's end, that round's summary.
    const resume = () => {
        const sp = spotFound;
        const list = sp.cards;
        if (!online()) setSecondMode('off');
        // Some of a saved quiz's cards: changes still go into the whole quiz.
        allCards.current = sp.subset && sp.saved && loaded && loaded.cards.length ? loaded.cards : null;
        setLoaded({ ...(loaded || { missing: 0 }), failed: false, cards: list });
        setSaved(sp.saved || null);
        setWritten(!!sp.written);
        if (sp.written) setKind(sp.kind);
        setDirection(sp.direction);
        if (sp.share) setShare(sp.share);
        setDeal(sp.deal || null);
        setRun(sp.run || {});
        setReview(null);
        const all = sp.written ? stretchRounds(list) : quiz.oneGo ? [[0, list.length]] : roundsOf(list.length);
        const i = Math.min(Math.max(0, sp.index), list.length - 1);
        setIndex(i);
        setFlipped(false);
        setMotion('next');
        if (Number.isInteger(sp.summary) && sp.summary < all.length) {
            setSummary(sp.summary);
            ttsPlayer.prime();
        } else {
            say(sideOf(list[i], false, toEnglishFor(list[i], sp.direction, sp.deal)));
        }
    };
    // ✕ or Esc: in the middle of a quiz, ask first ("Leave the quiz?"); it
    // can be continued later. Before it starts, or once it's done, just close.
    const requestClose = () => {
        const done = summary !== null && summary + 1 >= rounds.length;
        if (index >= 0 && cards.length && !done) setLeaving(true);
        else close();
    };
    const leaveDialog = (
        <div className="quiz-leave">
            <ConfirmDialog open={leaving} title="Leave the quiz?"
                message="You can continue where you left off next time."
                confirmLabel="Leave" cancelLabel="Stay"
                onConfirm={close} onCancel={() => setLeaving(false)} />
        </div>
    );

    // "10 more" at the end of a written quiz: a new round, new questions.
    const writeMore = async () => {
        if (writing) return;
        ttsPlayer.prime();
        setWriting(true);
        setWriteError('');
        try {
            const batch = Math.max(0, ...cards.map((c) => (c.stretch ? c.stretch.batch : 0))) + 1;
            const extra = await writeCards(PER_REQUEST, cards.map((c) => c.foreign.text), batch);
            if (latest.current !== quiz) return;
            if (!extra.length) throw new Error('No new questions came back. Try again.');
            const list = [...cards, ...extra];
            let d = deal;
            if (direction === 'mixed') {
                d = { ...dealDirections(extra, share), ...deal };
                setDeal(d);
                saveDeal(saved, share, d);
            }
            changeCards(list); // eslint-disable-line no-use-before-define
            setSummary(null);
            goTo(cards.length, list, d, 'next');
        } catch (err) {
            if (latest.current === quiz) setWriteError(err.message);
        } finally {
            if (latest.current === quiz) setWriting(false);
        }
    };
    const flip = () => {
        if (swiped.current) { swiped.current = false; return; } // the end of a swipe, not a tap
        setFlipped(!flipped);
        setMotion('flip');
        say(sideOf(cards[cur], !flipped));
    };
    const goTo = (i, list = cards, d = deal, how = i < index ? 'prev' : 'next') => {
        setIndex(i);
        show(i, how, list, d);
    };

    // The end of a round: its summary (and today counts for the streak).
    const endRound = (round) => {
        stopAudio();
        stopHearing();
        recordQuizDay();
        feel('light');
        setReview(null);
        setSummary(round);
    };
    // Next (Continue, swipe left, →): the next card, or at the end of the
    // round (or of the review), the summary.
    const next = () => {
        if (review) {
            if (review.pos + 1 < review.list.length) {
                setReview({ ...review, pos: review.pos + 1 });
                show(review.list[review.pos + 1]);
            } else {
                endRound(review.round);
            }
            return;
        }
        const round = roundAt(rounds, index);
        if (index + 1 >= rounds[round][1]) { endRound(round); return; }
        goTo(index + 1);
    };
    // Previous (swipe right, ←): the card before, in this quiz or review.
    const previous = () => {
        if (review) {
            if (review.pos === 0) return;
            setReview({ ...review, pos: review.pos - 1 });
            show(review.list[review.pos - 1], 'prev');
            return;
        }
        if (index > 0) goTo(index - 1);
    };

    // A swipe on the card: sideways, far enough, and more across than down.
    const onTouchStart = (e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
        swiped.current = false;
    };
    const onTouchEnd = (e) => {
        if (!touch.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touch.current.x;
        const dy = t.clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        swiped.current = true;
        setTimeout(() => { swiped.current = false; }, 400); // in case no tap follows
        if (dx < 0) next(); else previous();
    };

    // ---- Spoken answers (iPhone app) ----
    // The answer to the card's front is its other side.
    const answerTo = (c) => sideOf(c, true);
    // Which of the card's sides that is: 'english' or 'foreign'.
    const answerSideKey = (c) => (toEnglishFor(c) ? 'english' : 'foreign');
    const runStore = () => runKey(saved, runName);
    const rightFor = (c, text) => {
        const target = answerTo(c);
        return isRightAnswer(text, target.text, target.lang, target.also || []);
    };
    const reply = (correct) => {
        sayReply(correct ? 'Correct' : 'Not quite');
        feel(correct ? 'success' : 'error');
    };

    // Mark a card's answer: the one its score counts. With the second
    // opinion on Automatic, a "Not quite" is checked before it's said.
    const mark = (c, text) => {
        const correct = rightFor(c, text);
        const nextRun = { ...run, [cardKey(c)]: { heard: text, correct } };
        setRun(nextRun);
        saveRun(runStore(), nextRun);
        setAnswer(null);
        if (!correct && secondOn && secondMode === 'auto') askSecond(c, text, false); // eslint-disable-line no-use-before-define
        else reply(correct);
    };

    // 🎤: hear an answer for this card (tapping it while listening stops).
    // The first answer is marked at once; after that (and in a review) it's
    // practice, shown and said but not counted.
    const listen = async () => {
        if (listeningFor.current) { stopListening().catch(() => {}); return; }
        const c = cards[cur];
        const key = cardKey(c);
        const target = answerTo(c);
        const practice = !!run[key] || !!review;
        stopAudio(); // so the card's own audio isn't heard as the answer
        listeningFor.current = key;
        setOpinion(null);
        setAnswer({ status: 'listening', text: '', practice });
        try {
            const text = await listenForAnswer(target.lang, [target.text, ...(target.also || [])], (words) => {
                if (listeningFor.current === key) setAnswer((a) => (a && a.status === 'listening' ? { ...a, text: words } : a));
            });
            if (listeningFor.current !== key) return;
            if (!text) {
                setAnswer({ status: 'heard', text: '', practice });
            } else if (practice) {
                const correct = rightFor(c, text);
                setAnswer({ status: 'heard', text, practice, correct });
                if (!correct && secondOn && secondMode === 'auto') askSecond(c, text, true); // eslint-disable-line no-use-before-define
                else reply(correct);
            } else {
                mark(c, text);
            }
        } catch (err) {
            if (listeningFor.current !== key) return;
            const code = err && err.code;
            setAnswer({
                status: 'error', text: '', practice,
                error: code === 'DENIED' ? 'Remembrancer isn’t allowed to use the microphone or speech recognition. You can turn them on in Settings → Remembrancer.'
                    : code === 'UNAVAILABLE' ? 'Your iPhone can’t recognize this language right now.'
                        : code === 'UNIMPLEMENTED' ? 'Update the app to answer by speaking.'
                            : 'Couldn’t listen. Try again.',
            });
        } finally {
            if (listeningFor.current === key) listeningFor.current = null;
        }
    };

    // Score › Start over: forget this run's answers and begin at card 1.
    // A Mixed quiz is dealt again, so the cards go a new mix of ways.
    const startOver = () => {
        setRun({});
        saveRun(runStore(), {});
        setShowScore(false);
        setAnswer(null);
        setSummary(null);
        setReview(null);
        let d = deal;
        if (direction === 'mixed') {
            d = dealDirections(cards, share);
            setDeal(d);
            saveDeal(saved, share, d);
        }
        goTo(0, cards, d, 'next');
    };

    // Save to My Quizzes (a copy of these cards). Throws if it couldn't.
    // A quiz on one note keeps asking them in one round when it's opened
    // from My Quizzes (`oneRound`; QuizzesPage turns it back into oneGo).
    const store = async (entry, list) => {
        await dispatch(saveQuiz({ id: entry.id, name: entry.name, notebook: quiz.notebook, cards: list, oneRound: !!quiz.oneGo }));
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
            saveRun(runKey(entry, runName), run); // the answers so far stay with it
            if (direction === 'mixed') saveDeal(entry, share, deal); // and each card's way
            setNaming(null);
        } catch (err) {
            setSaveError('Couldn’t save the quiz. Check your connection and try again.');
        }
    };
    // The cards changed (Remove, colour, I was right): keep them, and in a
    // saved quiz, save them again. Started on some of a saved quiz's cards,
    // the change goes into the whole quiz (allCards): the others are kept.
    const changeCards = (list) => {
        const before = now.current.cards;
        setLoaded((l) => ({ ...l, cards: list }));
        if (saved) {
            let whole = list;
            if (allCards.current) {
                const byKey = new Map(list.map((c) => [cardKey(c), c]));
                const gone = new Set(before.map(cardKey).filter((k) => !byKey.has(k)));
                whole = allCards.current.filter((c) => !gone.has(cardKey(c))).map((c) => byKey.get(cardKey(c)) || c);
                allCards.current = whole;
            }
            setSaveError('');
            store(saved, whole).catch(() => setSaveError('Couldn’t save the change to this quiz. Check your connection.'));
        }
    };
    // Change the showing card (a function from the card to its new self).
    const changeCard = (fn) => changeCards(cards.map((c, i) => (i === cur ? fn(c) : c)));

    // "I was right": what was heard is another right answer for this card
    // (kept in its answer side's `also`), and the mark becomes Correct. A
    // practice try is only marked; the counted answer stays as it was.
    //
    // acceptAnswer does it for the card with that key (the one showing, or
    // for a second opinion, the one it was asked about), from the latest
    // cards and answers. extra: { by: 'second', why } for a second opinion.
    const acceptAnswer = (key, sideKey, heard, practice, extra = {}) => {
        const { cards: list, run: latestRun } = now.current;
        changeCards(list.map((card) => {
            if (cardKey(card) !== key) return card;
            const also = card[sideKey].also || [];
            return also.includes(heard) ? card : { ...card, [sideKey]: { ...card[sideKey], also: [...also, heard] } };
        }));
        if (practice) {
            setAnswer((a) => (a && a.practice && a.text === heard ? { ...a, correct: true, marked: true, ...extra } : a));
        } else {
            const nextRun = { ...latestRun, [key]: { heard, correct: true, marked: true, ...extra } };
            setRun(nextRun);
            saveRun(runStore(), nextRun);
        }
    };
    const iWasRight = (heard, practice) => {
        const c = cards[cur];
        acceptAnswer(cardKey(c), answerSideKey(c), heard, practice);
        feel('success');
    };

    // ---- Second opinion ----
    // A "no" is remembered by card, answer side and what was heard.
    const verdictKey = (c, heard) => `${cardKey(c)}\u0002${answerSideKey(c)}\u0002${plainQuestion(heard)}`;
    /**
     * Ask the model whether what was heard is right after all (the rules
     * said "Not quite"), then say the verdict. A "yes" counts it as right
     * and keeps the answer (acceptAnswer); a "no" shows why.
     * @param {object} c the card
     * @param {string} heard what speech recognition heard
     * @param {boolean} practice a practice try, not the counted answer
     */
    const askSecond = async (c, heard, practice) => {
        const key = cardKey(c);
        const sideKey = answerSideKey(c);
        const vkey = verdictKey(c, heard);
        const stillHere = () => now.current.curKey === key;
        const known = verdicts.current.get(vkey);
        if (known) {
            setOpinion({ key, heard, status: 'wrong', why: known.why });
            reply(false);
            return;
        }
        if (!online()) {
            setOpinion({ key, heard, status: 'error', error: 'A second opinion needs a connection.' });
            reply(false);
            return;
        }
        const target = answerTo(c);
        setOpinion({ key, heard, status: 'asking' });
        let verdict;
        try {
            verdict = await dispatch(requestSecondOpinion({
                asked: sideOf(c, false).text,
                answer: target.text,
                also: target.also || [],
                language: languageName(target.lang),
                scene: c.scene || '',
                heard,
            }));
        } catch (err) {
            if (stillHere()) {
                setOpinion({ key, heard, status: 'error', error: err.message });
                reply(false);
            }
            return;
        }
        if (latest.current !== quiz) return; // the quiz was closed meanwhile
        if (verdict.correct) {
            acceptAnswer(key, sideKey, heard, practice, { by: 'second', why: verdict.why });
            if (stillHere()) { setOpinion(null); reply(true); }
        } else {
            verdicts.current.set(vkey, { why: verdict.why });
            if (stillHere()) { setOpinion({ key, heard, status: 'wrong', why: verdict.why }); reply(false); }
        }
    };
    // Undo "I was right": back to Not quite, and that answer isn't right any more.
    const undoRight = () => {
        const c = cards[cur];
        const result = run[cardKey(c)];
        const sideKey = answerSideKey(c);
        changeCard((card) => {
            const also = (card[sideKey].also || []).filter((a) => a !== result.heard);
            const { also: dropped, ...rest } = card[sideKey];
            return { ...card, [sideKey]: also.length ? { ...rest, also } : rest };
        });
        const nextRun = { ...run, [cardKey(c)]: { heard: result.heard, correct: false } };
        setRun(nextRun);
        saveRun(runStore(), nextRun);
    };

    // ⋯ › Remove: drop this card from the quiz (the note keeps its line), and
    // show the next one (the one before, if it was the last).
    const remove = () => {
        const list = cards.filter((c, i) => i !== index);
        changeCards(list);
        if (!list.length) { stopAudio(); setAudioError(''); return; }
        const i = Math.min(index, list.length - 1);
        setIndex(i);
        show(i, 'next', list);
    };
    // ⋯ › colour: this card's colour (one of the notes' colours,
    // utils/itemColors.js), or none. It belongs to this quiz's card, not the
    // note: kept in the card, so a saved quiz saves it.
    const setCardColor = (key) => {
        changeCard((c) => {
            const { color, ...rest } = c;
            return key ? { ...rest, color: key } : rest;
        });
    };
    const copy = (text) => copyText(text).then(() => setCopied('done'), () => setCopied('failed'));

    // "See note": go to the card's note, keeping the quiz for "Back to quiz".
    const openSource = (source) => {
        stopAudio();
        setMenu(false);
        setAway(true);
        // A quiz from one notebook opens the note there; one across
        // notebooks (a note and its links, a tag) through the note's own
        // address, which finds a notebook that has it (pages/NoteLinkPage.js).
        navigate(quiz.notebook ? itemPath(quiz.notebook, source) : noteLinkHref(source.type, source.id));
    };
    const comeBack = () => {
        setAway(false);
        if (summary === null && cur >= 0 && cards[cur]) say(sideOf(cards[cur], flipped));
    };

    if (away) {
        return (
            <div className="quiz-back" role="region" aria-label="Quiz">
                <button type="button" className="quiz-back__go" onClick={comeBack}>
                    <i className="arrow left icon" aria-hidden="true"></i>Back to quiz
                </button>
                <button type="button" className="quiz-back__close" aria-label="End the quiz" title="End the quiz"
                    onClick={requestClose}>
                    <i className="times icon" aria-hidden="true"></i>
                </button>
                {leaveDialog}
            </div>
        );
    }

    if (index < 0) {
        const material = loaded && loaded.material;
        // Questions can be written from these notes: some are marked in a foreign language.
        const canWrite = !!(material && material.lang && material.notes.length);
        const k = canWrite ? kind : 0; // the kind asked for (My cards when nothing can be written)
        const lang = cards.length ? quizLanguage(cards) : languageName(material && material.lang);
        // Something to quiz on: cards, or for a written kind, the notes.
        const ready = k > 0 ? canWrite : cards.length > 0;
        // How many: of My cards (all, or that many at most), or to write.
        const asked = k > 0 ? count : cardCount === 'all' ? cards.length : Math.min(cardCount, cards.length);
        const roundsAsked = quiz.oneGo ? 1 : roundsOf(asked).length;
        // A row of choices on the sheet (the Mixed shares' look).
        // grid: two by two (the four kinds).
        const pills = (label, options, value, pick, grid = false) => (
            <div className={`quiz-mix__shares${grid ? ' quiz-mix__shares--grid' : ''}`} role="radiogroup" aria-label={label}>
                {options.map((o) => (
                    <button type="button" key={o.key} role="radio" aria-checked={value === o.key}
                        className={`quiz-mix__share${value === o.key ? ' on' : ''}`} onClick={() => pick(o.key)}>
                        {o.name}
                    </button>
                ))}
            </div>
        );
        // "Continue where you left off": the card you were on, the round,
        // and how many you got right (iPhone).
        const continueBox = () => {
            const sp = spotFound;
            const n = sp.cards.length;
            const all = sp.written ? stretchRounds(sp.cards) : quiz.oneGo ? [[0, n]] : roundsOf(n);
            const atEnd = Number.isInteger(sp.summary);
            const r = atEnd ? sp.summary : roundAt(all, sp.index);
            const right = scoreOf(sp.run || {}, sp.cards).correct;
            const what = [
                sp.written ? (QUIZ_KINDS.find((q) => q.key === sp.kind) || QUIZ_KINDS[1]).name : null,
                atEnd ? `End of round ${r + 1}` : `Card ${Math.min(sp.index, n - 1) + 1} of ${n}`,
                all.length > 1 && !atEnd ? `Round ${r + 1} of ${all.length}` : null,
                speech && right ? `${right} right` : null,
            ].filter(Boolean).join(' · ');
            return (
                <div className="quiz-continue">
                    <div className="quiz-mix__label">
                        Continue where you left off
                        <span className="quiz-mix__legend">{what}</span>
                    </div>
                    <button type="button" className="cb-btn cb-btn--accent" onClick={resume}>Continue</button>
                </div>
            );
        };
        const answerIn = {
            'to-en': `You see ${lang}, you answer in English.`,
            'from-en': `You see English, you answer in ${lang}.`,
            mixed: 'Some each way.',
        };
        return (
            <div className="cb-sheet__overlay" onMouseDown={close}>
                <div className="cb-sheet" role="dialog" aria-modal="true" aria-label={`Quiz on ${title}`}
                    onMouseDown={(e) => e.stopPropagation()}>
                    <div className="cb-sheet__grab" aria-hidden="true" />
                    <div className="cb-sheet__head">
                        <h3 className="cb-sheet__title">
                            Quiz · {title}
                            {loaded && !loaded.failed && (
                                <span className="quiz-sheet__sub">
                                    {k > 0 ? `From ${material.notes.length} note${material.notes.length === 1 ? '' : 's'}`
                                        : `${cards.length} card${cards.length === 1 ? '' : 's'}`}
                                </span>
                            )}
                        </h3>
                        <button type="button" className="a2c__close" aria-label="Close" onClick={close}>
                            <i className="times icon"></i>
                        </button>
                    </div>
                    {loaded && spotFound && continueBox()}
                    {!loaded ? (
                        <Spinner label="Finding cards…" />
                    ) : loaded.failed ? (
                        <div className="cb-sheet__error">Couldn't load the notes. Check your connection and try again.</div>
                    ) : !cards.length && !canWrite ? (
                        <div className="add-sheet__hint">
                            {saved ? 'This quiz has no cards left.'
                                : `No foreign phrases found in ${quiz.notebook ? 'this notebook' : 'these notes'}.`}
                        </div>
                    ) : (
                        <div className="quiz-sheet__choices">
                            {spotFound && <div className="quiz-sheet__or">Or start a new one</div>}
                            {canWrite && (
                                <div className="quiz-opt">
                                    <div className="quiz-mix__label">
                                        Questions
                                        <span className="quiz-mix__legend">
                                            {k > 0 && !online() ? 'Needs a connection to write the questions.'
                                                : k === 0 && !cards.length ? `No “${lang} — English” lines here to make cards from.`
                                                    : QUIZ_KINDS[k].hint}
                                        </span>
                                    </div>
                                    {pills('Questions', QUIZ_KINDS, k, (v) => { setKind(v); setWriteError(''); }, true)}
                                </div>
                            )}
                            {ready && (
                                <div className="quiz-opt">
                                    <div className="quiz-mix__label">
                                        How many
                                        <span className="quiz-mix__legend">
                                            {k > 0 ? `Up to ${MAX_WRITTEN}.`
                                                : asked < cards.length ? `${asked} of your ${cards.length}, picked at random.`
                                                    : roundsAsked > 1 ? `In ${roundsAsked} rounds of about 20.` : 'All your cards.'}
                                        </span>
                                    </div>
                                    {k > 0 ? (
                                        <HowMany value={count} most={MAX_WRITTEN} onChange={setCount} />
                                    ) : (
                                        <HowMany value={cardCount} most={cards.length} onChange={setCardCount} all={cards.length} />
                                    )}
                                </div>
                            )}
                            {ready && (
                                <div className="quiz-opt">
                                    <div className="quiz-mix__label">
                                        Answer in
                                        <span className="quiz-mix__legend">{answerIn[direction]}</span>
                                    </div>
                                    {pills('Answer in', [
                                        { key: 'to-en', name: 'English' },
                                        { key: 'from-en', name: lang },
                                        { key: 'mixed', name: 'Mixed' },
                                    ], direction, setDirection)}
                                    {direction === 'mixed' && (
                                        <>
                                            <span className="quiz-mix__legend">Answer in English / {lang}</span>
                                            {pills('How much each way', MIX_SHARES.map((v) => ({ key: v, name: `${v} / ${100 - v}` })),
                                                share, setShare)}
                                        </>
                                    )}
                                </div>
                            )}
                            {ready && speech && (
                                <div className="quiz-opt">
                                    <div className="quiz-mix__label">
                                        Second opinion
                                        <span className="quiz-mix__legend">
                                            {online() ? SECOND_OPINION.find((o) => o.key === secondMode).hint
                                                : 'Needs a connection: the rules alone will decide.'}
                                        </span>
                                    </div>
                                    {pills('Second opinion', SECOND_OPINION, secondMode, (v) => { setSecondMode(v); rememberSecondOpinion(v); })}
                                </div>
                            )}
                            {writing ? (
                                <Spinner label={`Writing ${asked} questions…`} />
                            ) : ready && (
                                <button type="button" className={`cb-btn ${spotFound ? 'cb-btn--ghost' : 'cb-btn--accent'} quiz-sheet__start`}
                                    onClick={() => go(k, asked)}>
                                    Start
                                </button>
                            )}
                            {writeError && <div className="cb-sheet__error">{writeError}</div>}
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

    const card = cards[cur];
    const lang = quizLanguage(cards);
    // The card's counted answer (a review starts each card afresh: its tries
    // are practice).
    const result = card && !review ? run[cardKey(card)] : null;
    // What was just heard as practice (after the counted answer, or in a review).
    const tried = answer && answer.status === 'heard' && answer.practice && answer.text ? answer : null;
    const answered = !!(result || tried);
    // After an answer the card shows both sides (unless you flip it), but
    // not while 🎤 listens to another try: the answer would give it away.
    const listeningNow = !!(answer && answer.status === 'listening');
    const revealed = card && answered && !flipped && !listeningNow;
    const side = card && sideOf(card, flipped);
    const target = card && answerTo(card);
    // The card's own colour, if it was given one ({ key, label, tint, ink }).
    const cardColor = card && card.color ? ITEM_COLORS.find((c) => c.key === card.color) || null : null;
    // "Spanish → English": the way this card is asked.
    const way = card && (toEnglishFor(card) ? `${lang} → English` : `English → ${lang}`);
    const round = summary !== null ? summary : roundAt(rounds, index);
    const [roundStart, roundEnd] = rounds[round] || [0, 0];
    const lastInRound = review ? review.pos + 1 >= review.list.length : index + 1 >= roundEnd;
    const nextLabel = lastInRound ? 'Finish round' : 'Next';
    // Where we are: "3/20" in the round (or in the review).
    const pos = review ? review.pos + 1 : index - roundStart + 1;
    const of = review ? review.list.length : roundEnd - roundStart;

    // The menu (⋯): everything that isn't answering.
    const menuSheet = () => (
        <>
            <div className="quiz-menu__scrim" onMouseDown={() => setMenu(false)} aria-hidden="true" />
            <div className="quiz-menu" role="menu" aria-label="Quiz menu">
                {speech && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setShowScore(true); }}>
                        <i className="chart bar outline icon" aria-hidden="true"></i>Score
                    </button>
                )}
                {saved ? (
                    <div className="quiz-menu__note"><i className="check icon" aria-hidden="true"></i>Saved as “{saved.name}”</div>
                ) : (
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setNaming(`${quiz.title} ${written ? QUIZ_KINDS[kind].name.toLowerCase() : 'quiz'}`); }}>
                        <i className="save outline icon" aria-hidden="true"></i>Save quiz
                    </button>
                )}
                {card && card.source && (
                    <button type="button" role="menuitem" onClick={() => openSource(card.source)}>
                        {/* Not the note's title: it could give the answer away. */}
                        <i className="file alternate outline icon" aria-hidden="true"></i>See note
                    </button>
                )}
                {card && (
                    <button type="button" role="menuitem" onClick={() => copy(side.text)}>
                        <i className={`${copied === 'done' ? 'check' : copied === 'failed' ? 'exclamation' : 'copy outline'} icon`}
                            aria-hidden="true"></i>
                        {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Couldn’t copy' : 'Copy text'}
                    </button>
                )}
                {card && (
                    <div className="quiz-menu__colors" role="group" aria-label="Card color">
                        <span className="quiz-menu__label">Card color</span>
                        <span className="quiz-menu__swatches">
                            {ITEM_COLORS.map((c) => (
                                <button type="button" key={c.key} aria-label={c.label} title={c.label}
                                    aria-pressed={cardColor ? cardColor.key === c.key : false}
                                    className={`quiz__swatch${cardColor && cardColor.key === c.key ? ' on' : ''}`}
                                    style={{ background: c.ink }} onClick={() => setCardColor(c.key)} />
                            ))}
                            <button type="button" className="quiz__swatch quiz__swatch--none" aria-label="No color"
                                title="No color" onClick={() => setCardColor(null)}>
                                <i className="ban icon" aria-hidden="true"></i>
                            </button>
                        </span>
                    </div>
                )}
                {card && !review && (
                    <button type="button" role="menuitem" className="quiz-menu__danger"
                        onClick={() => { setMenu(false); remove(); }}>
                        <i className="trash alternate outline icon" aria-hidden="true"></i>Remove card from quiz
                    </button>
                )}
            </div>
        </>
    );

    // ✕, the round's progress, ⋯.
    const topBar = () => (
        <div className="quiz__top">
            <button type="button" className="quiz__icon" aria-label="End the quiz" title="End the quiz" onClick={requestClose}>
                <i className="times icon" aria-hidden="true"></i>
            </button>
            <div className="quiz__progress">
                <div className="quiz__bar" role="progressbar" aria-valuemin={0} aria-valuemax={of} aria-valuenow={summary !== null ? of : pos}
                    aria-label={review ? 'Review' : `Round ${round + 1}`}>
                    <div className="quiz__barfill" style={{ width: `${of ? ((summary !== null ? of : pos) / of) * 100 : 0}%` }} />
                </div>
                <span className="quiz__where">
                    {review ? 'Review' : rounds.length > 1 ? `Round ${round + 1} of ${rounds.length}` : ''}
                </span>
            </div>
            <span className="quiz__count">{summary !== null ? `${of}/${of}` : card ? `${pos}/${of}` : ''}</span>
            <span className="quiz__menuwrap">
                <button type="button" className={`quiz__icon${menu ? ' on' : ''}`} aria-label="Menu" title="Menu"
                    aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                    <i className="ellipsis horizontal icon" aria-hidden="true"></i>
                </button>
                {menu && menuSheet()}
            </span>
        </div>
    );

    // ‹ and › beside the main button (swiping does the same).
    const sideButtons = (main) => (
        <div className="quiz__controls">
            <button type="button" className="quiz__step" aria-label="Previous card" title="Previous card" onClick={previous}
                disabled={review ? review.pos === 0 : index === 0}>
                <i className="angle left icon" aria-hidden="true"></i>
            </button>
            {main}
            <button type="button" className="quiz__step" aria-label={nextLabel} title={nextLabel} onClick={next}>
                <i className="angle right icon" aria-hidden="true"></i>
            </button>
        </div>
    );

    // The coloured panel after an answer: Correct / Not quite, what you
    // said, and Continue, I was right, Try again.
    //
    // With a second opinion: "Checking…" while it's asked; once it said
    // yes, "second opinion" and its reason; once it said no, its reason; and
    // on Ask me, a "Second opinion" button after "Not quite".
    const feedback = (said, correct, { marked = false, practice = false, by = '', why = '' } = {}) => {
        const op = opinion && card && opinion.key === cardKey(card) && opinion.heard === said ? opinion : null;
        const asking = !!(op && op.status === 'asking');
        return (
        <div className={`quiz-feedback quiz-feedback--${asking ? 'checking' : correct ? 'right' : 'wrong'}`} aria-live="polite">
            <div className="quiz-feedback__title">
                <i className={`${asking ? 'hourglass half' : correct ? 'check circle' : 'exclamation circle'} icon`} aria-hidden="true"></i>
                {asking ? 'Getting a second opinion…' : <>{practice ? 'Practice: ' : ''}{correct ? 'Correct' : 'Not quite'}</>}
                {marked && !asking && <span className="quiz-feedback__marked">{by === 'second' ? 'second opinion' : 'you marked it'}</span>}
            </div>
            <div className="quiz-feedback__said">
                You said “<span lang={target.lang}>{said}</span>”
                {!correct && <> · the card says “<span lang={target.lang}>{target.text}</span>”</>}
            </div>
            {correct && why && <div className="quiz-feedback__why">{why}</div>}
            {!correct && op && op.status === 'wrong' && <div className="quiz-feedback__why">Second opinion: {op.why || 'not right.'}</div>}
            {!correct && op && op.status === 'error' && <div className="quiz-feedback__why">{op.error}</div>}
            <button type="button" className="quiz-feedback__go" onClick={next}>
                {lastInRound ? 'Finish round' : 'Continue'}
            </button>
            <div className="quiz-feedback__more">
                {!correct && !asking && secondOn && (secondMode === 'ask' || (op && op.status === 'error')) && !(op && op.status === 'wrong') && (
                    <button type="button" onClick={() => askSecond(card, said, practice)}>
                        <i className="balance scale icon" aria-hidden="true"></i>{op ? 'Ask again' : 'Second opinion'}
                    </button>
                )}
                {!correct && !asking && (
                    <button type="button" onClick={() => iWasRight(said, practice)}>
                        <i className="check icon" aria-hidden="true"></i>I was right
                    </button>
                )}
                {marked && !practice && (
                    <button type="button" onClick={undoRight}>
                        <i className="undo icon" aria-hidden="true"></i>Undo
                    </button>
                )}
                <button type="button" onClick={listen}>
                    <i className="microphone icon" aria-hidden="true"></i>Try again
                </button>
            </div>
        </div>
        );
    };

    // Under the card: the mic (iPhone) or Show answer / Next (website), or
    // after an answer, its feedback.
    const bottom = () => {
        const listening = answer && answer.status === 'listening';
        if (tried && !listening) {
            return feedback(tried.text, tried.correct, { practice: true, marked: tried.marked, by: tried.by, why: tried.why });
        }
        if (result && !listening && !(answer && answer.status !== 'heard')) {
            return feedback(result.heard, result.correct, { marked: result.marked, by: result.by, why: result.why });
        }
        if (speech && !flipped) {
            const heardNothing = answer && answer.status === 'heard' && !answer.text;
            return (
                <div className="quiz__answer">
                    {sideButtons(
                        <button type="button" className={`quiz__mic${listening ? ' quiz__mic--on' : ''}`} onClick={listen}
                            aria-label={listening ? 'Stop listening' : `Say it in ${languageLabel(target.lang).replace(/ \(.*\)$/, '')}`}>
                            <i className={`${listening ? 'stop' : 'microphone'} icon`} aria-hidden="true"></i>
                        </button>,
                    )}
                    <div className={`quiz__miclabel${answer && answer.status === 'error' ? ' quiz__miclabel--error' : ''}`}
                        aria-live="polite">
                        {listening ? (answer.text ? <span lang={target.lang}>“{answer.text}”</span> : 'Listening… tap to stop')
                            : answer && answer.status === 'error' ? answer.error
                                : heardNothing ? 'Didn’t catch that. Tap to try again.'
                                    : `Say it in ${languageLabel(target.lang).replace(/ \(.*\)$/, '')}`}
                    </div>
                </div>
            );
        }
        return (
            <div className="quiz__answer">
                {sideButtons(
                    flipped ? (
                        <button type="button" className="quiz__main" onClick={next}>
                            {nextLabel}<i className="arrow right icon" aria-hidden="true"></i>
                        </button>
                    ) : (
                        <button type="button" className="quiz__main" onClick={flip}>Show answer</button>
                    ),
                )}
            </div>
        );
    };

    // The end of a round: how it went, the streak, and what's next.
    const summarySheet = () => {
        const inRound = cards.slice(roundStart, roundEnd);
        const s = scoreOf(run, inRound);
        const missed = [];
        for (let i = roundStart; i < roundEnd; i += 1) {
            const r = run[cardKey(cards[i])];
            if (r && !r.correct) missed.push(i);
        }
        const streak = dayStreak();
        const lastRound = round + 1 >= rounds.length;
        const whole = scoreOf(run, cards);
        return (
            <div className="quiz-summary">
                {speech ? (
                    <ScoreRing percent={s.score} label={s.answered ? `${s.correct}/${s.answered}` : '–'} />
                ) : (
                    <div className="quiz-summary__done" aria-hidden="true"><i className="check icon"></i></div>
                )}
                <h3 className="quiz-summary__title">
                    {lastRound ? 'Quiz done' : rounds.length > 1 ? `Round ${round + 1} done` : 'Done'}
                </h3>
                {speech && !s.answered && <div className="quiz-summary__line">No answers this round.</div>}
                <div className="quiz-summary__tiles">
                    <div className="quiz-summary__tile">
                        <span className="quiz-summary__tilelabel">Day streak</span>
                        <span className="quiz-summary__tilenum">{streak} day{streak === 1 ? '' : 's'}</span>
                    </div>
                    {speech ? (
                        <div className="quiz-summary__tile">
                            <span className="quiz-summary__tilelabel">To review</span>
                            <span className="quiz-summary__tilenum">{missed.length}</span>
                        </div>
                    ) : (
                        <div className="quiz-summary__tile">
                            <span className="quiz-summary__tilelabel">Cards</span>
                            <span className="quiz-summary__tilenum">{inRound.length}</span>
                        </div>
                    )}
                </div>
                {speech && rounds.length > 1 && whole.score !== null && (
                    <div className="quiz-summary__line">Whole quiz so far: {whole.score} / 100</div>
                )}
                <div className="quiz-summary__btns">
                    <button type="button" className="quiz__main" onClick={() => {
                        setSummary(null);
                        if (lastRound) { close(); return; }
                        goTo(rounds[round + 1][0], cards, deal, 'next');
                    }}>
                        {lastRound ? 'Finish' : 'Next round'}
                    </button>
                    {written && lastRound && !writing && (
                        <button type="button" className="quiz__second" onClick={writeMore}>
                            {PER_REQUEST} more
                        </button>
                    )}
                    {writing && <Spinner label={`Writing ${PER_REQUEST} more…`} />}
                    {writeError && <div className="quiz__error">{writeError}</div>}
                    {missed.length > 0 && (
                        <button type="button" className="quiz__second" onClick={() => {
                            setSummary(null);
                            setReview({ round, list: missed, pos: 0 });
                            show(missed[0]);
                        }}>
                            Review the {missed.length} missed
                        </button>
                    )}
                </div>
            </div>
        );
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
                        <div className="quiz-score__line">No answers yet. Tap the microphone on a card and say the answer.</div>
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
                {topBar()}
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
                {summary !== null ? summarySheet() : card ? (
                    <>
                        {/* A tappable box rather than a button, so the 🔊
                            button can sit inside it (a button can't hold
                            another one). Its key changes with the card and
                            side, so it's drawn afresh and animates in. */}
                        <div key={`${cur}:${flipped}`} role="button" tabIndex={0}
                            className={`quiz__card quiz__card--${motion}${flipped ? ' quiz__card--back' : ''}`}
                            style={cardColor ? { background: cardColor.tint, borderColor: cardColor.ink } : undefined}
                            data-color={cardColor ? cardColor.key : undefined}
                            onClick={flip} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}>
                            <span className="quiz__way">{flipped ? 'Answer' : way}</span>
                            {card.scene && <span className="quiz__scene">{card.scene}</span>}
                            <span className="quiz__text" lang={side.lang}>{side.text}</span>
                            {revealed && (
                                <span className="quiz__reveal" lang={target.lang}>{target.text}</span>
                            )}
                            {card.stretch && (revealed || flipped) && (
                                <span className="quiz__stretchinfo">
                                    {card.stretch.own ? 'From your notes' : 'Written for this quiz'}
                                    {card.stretch.newWords && card.stretch.newWords.length > 0 && (
                                        <> · New: <span lang={card.foreign.lang}>{card.stretch.newWords.join(', ')}</span></>
                                    )}
                                </span>
                            )}
                            <button type="button" className="quiz__again" aria-label="Read aloud" title="Read aloud"
                                onClick={(e) => { e.stopPropagation(); say(revealed ? target : side); }}>
                                <i className="volume up icon" aria-hidden="true"></i>
                            </button>
                            {!review && index < 3 && !flipped && !answered && (
                                <span className="quiz__hint">
                                    {touchScreen ? 'Tap the card to flip · swipe for the next one'
                                        : 'Click the card to flip · ← → for the next one'}
                                </span>
                            )}
                        </div>
                        {bottom()}
                    </>
                ) : (
                    <div className="quiz__empty">You removed every card.</div>
                )}
                {audioError && <div className="quiz__error">{audioError}</div>}
                {saveError && <div className="quiz__error">{saveError}</div>}
                {!card && summary === null && (
                    <button type="button" className="quiz__main quiz__done" onClick={close}>Done</button>
                )}
            </div>
            {showScore && scoreSheet()}
            {leaveDialog}
        </div>
    );
}

export default NotebookQuiz;
