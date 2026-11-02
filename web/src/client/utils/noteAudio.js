// The read-aloud controls follow the note you're looking at.
//
//   - Opening a note (SearchResult) gets it ready to play in the big
//     controls (PlayerPanel): ttsPlayer.cue() — ▶ there, or the note's own
//     read-aloud button, plays it.
//       · On a phone, always: the controls come up with the note.
//       · Everywhere, when another note (or a word, or a selection) was
//         being read: that stops, and the controls switch to this note.
//     A notebook's Play all / Play selected (a reading of several notes)
//     keeps going, so you can look through notes while listening; so does
//     the quiz.
//   - ⏮ Note / Note ⏭ in the controls open the previous / next note of the
//     notebook (the page registers how: setNoteNav). If a note was playing,
//     the new one starts playing by itself, so a notebook can be listened
//     through hands-free; otherwise it's just ready.
//   - Leaving a note that's only ready (not started) puts the controls away.
import ttsPlayer from './ttsPlayer';
import { cardChunks } from './tts';

/** The player's sourceId for one note's reading (its read-aloud button uses it too). */
export const noteSource = (cardId) => `note:${cardId}`;

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

// Readings that opening a note leaves alone.
const keeps = (snap) => snap.status === 'idle'
    || snap.notes > 1 // Play all / Play selected
    || snap.sourceId === 'quiz' || snap.sourceId === 'voice-preview';

// Set by ⏮ Note / Note ⏭ while playing: the next note opened plays at once.
let playNextOpened = false;

/**
 * A note was opened (or another one replaced it on screen).
 * @param {{card_id: string, title: string, content: string}} card
 */
export function noteOpened(card) {
    const source = noteSource(card.card_id);
    const snap = ttsPlayer.snapshot();
    const autoplay = playNextOpened;
    playNextOpened = false;
    // Already this note's: playing stays as it is; only ready, it's got ready
    // again (the note may have been edited).
    if (snap.sourceId === source && snap.status !== 'ready') return;
    const somethingElse = snap.status !== 'idle' && snap.sourceId !== source;
    if (somethingElse && keeps(snap)) return;
    if (!somethingElse && snap.sourceId !== source && !isPhone()) return; // computers: controls only once something plays
    const chunks = cardChunks(card);
    const meta = { title: card.title, sourceId: source };
    if (autoplay) ttsPlayer.play(chunks, meta);
    else ttsPlayer.cue(chunks, meta);
}

/**
 * The note was closed (another page, not another note): if it was only
 * ready, not started, the controls go away.
 * @param {string} cardId
 */
export function noteClosed(cardId) {
    // A moment later: when another note replaced it, that note has taken
    // the controls by then (noteOpened), and this changes nothing.
    setTimeout(() => {
        const snap = ttsPlayer.snapshot();
        if (snap.status === 'ready' && snap.sourceId === noteSource(cardId)) ttsPlayer.stop();
    }, 0);
}

// ---- ⏮ Note / Note ⏭ ----
let nav = { prev: null, next: null };
const navListeners = new Set();

/**
 * The notebook page says how to open the previous / next note (functions),
 * or null where there's none. setNoteNav(null) when no note is open.
 * @param {{prev: Function|null, next: Function|null}|null} value
 */
export function setNoteNav(value) {
    nav = value || { prev: null, next: null };
    navListeners.forEach((fn) => fn(nav));
}
export const getNoteNav = () => nav;
/** PlayerPanel follows the note buttons. Returns a function that stops listening. */
export function onNoteNav(fn) {
    navListeners.add(fn);
    return () => navListeners.delete(fn);
}

/**
 * ⏮ Note (-1) / Note ⏭ (+1): open that note; if one was playing, it plays.
 * @param {-1|1} step
 */
export function goToNote(step) {
    const go = step < 0 ? nav.prev : nav.next;
    if (!go) return;
    const { status } = ttsPlayer.snapshot();
    playNextOpened = status === 'playing' || status === 'loading';
    if (playNextOpened) ttsPlayer.prime(); // in the tap, for iPhones
    go();
}
