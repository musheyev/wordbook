import { dbGet, dbPut } from './db';

// The notes opened most recently on this device, so their saved copies are
// kept even when they aren't downloaded.
//
// Why: when the iPhone app opens again, it goes back to the note that was
// open (utils/lastPlace.js) and shows it from the phone's copy straight away,
// before the server answers (offline/apiCache.js, requestSavedFirst). That
// only works if a copy of the note is on the phone. Downloaded notes always
// have one; this list keeps one for the last RECENT_LIMIT notes opened too.
//
//   noteOpened(key)   a note was opened (key "card:<id>"): it moves to the
//                     front of the list. When the list grows past the limit,
//                     the oldest falls off, and its copy is deleted unless a
//                     download needs it (offline/downloads.js, collectGarbage).
//   isRecent(key)     is it in the list? (apiCache saves its answers if so)
//   recentKeys()      the whole list, newest first
//
// The list lives in IndexedDB (offline/db.js, "meta" store, one record), like
// the download registry, and is read at start-up (loadRecent). These copies
// don't count as downloads: a recent note isn't shown as "on this device" in
// the notebook lists.
const RECORD_KEY = 'recent';
export const RECENT_LIMIT = 20;

let recent = []; // item keys, newest first
let onDropped = () => {};

/** Read the list saved on this device (at start-up, offline/downloads.js). */
export async function loadRecent({ dropped } = {}) {
    if (dropped) onDropped = dropped;
    const saved = await dbGet('meta', RECORD_KEY).catch(() => null);
    recent = Array.isArray(saved) ? saved : [];
}

/** Is this item (a key like "card:<id>") one of the recently opened notes? */
export const isRecent = (key) => !!key && recent.includes(key);

/** The recently opened notes, newest first. */
export const recentKeys = () => [...recent];

/**
 * A note was opened: put it first. Notes that fall off the end lose their
 * copies (through `dropped`, given to loadRecent) unless downloaded.
 * @param {string} key e.g. "card:3f2a…"
 */
export function noteOpened(key) {
    if (!key || recent[0] === key) return;
    const next = [key, ...recent.filter((k) => k !== key)];
    const droppedKeys = next.slice(RECENT_LIMIT);
    recent = next.slice(0, RECENT_LIMIT);
    dbPut('meta', RECORD_KEY, recent).catch(() => { /* not saved; kept for this visit */ });
    if (droppedKeys.length) onDropped(droppedKeys);
}

/** Forget the list (log out; the stores themselves are cleared there). */
export function resetRecent() {
    recent = [];
}
