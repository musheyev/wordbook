import { dbGet, dbPut } from './db';

// What's downloaded on this device — the "registry" — and questions about it.
//
// It's kept in IndexedDB (offline/db.js, "meta" store, one record) so it
// survives restarts, and mirrored into the Redux store (reducers/
// offlineReducer.js) so screens redraw when it changes. Item keys are
// "<type>:<id>", e.g. "card:3f2a…" for a note, "word:serendipity".
//
//   notebooks  { [name]: { at, complete } }  notebooks downloaded whole:
//                                 everything in them, including items added
//                                 later. `complete` once every item's text,
//                                 pictures and audio have arrived; until then
//                                 the download is resumed whenever there's a
//                                 connection (offline/downloads.js).
//   items      { [key]:  { at, complete } }  notes/words downloaded one by one
//   saved      { [key]: true }     items whose text is on the device: the
//                                 ones that can be opened offline. (A
//                                 download in progress has saved some.)
//   lists      { [name]: [keys] }  each notebook's items as last seen from
//                                 the server (any notebook opened on this
//                                 device). Tells which notebooks a
//                                 downloaded note belongs to, and how many
//                                 items aren't downloaded.
const RECORD_KEY = 'registry';
const EMPTY = { notebooks: {}, items: {}, lists: {}, saved: {} };

let registry = EMPTY;
const listeners = new Set();

/** The registry now (treat as read-only; change it with updateRegistry). */
export const getRegistry = () => registry;

/** Read the registry saved on this device (at start-up). */
export async function loadRegistry() {
    const saved = await dbGet('meta', RECORD_KEY).catch(() => null);
    registry = { ...EMPTY, ...(saved || {}) };
    listeners.forEach((fn) => fn(registry));
    return registry;
}

/**
 * Change the registry: `change` gets a copy to edit. Saves it and tells
 * subscribers (the Redux mirror).
 *
 * @param {(draft: typeof EMPTY) => void} change
 */
export function updateRegistry(change) {
    const draft = {
        notebooks: { ...registry.notebooks },
        items: { ...registry.items },
        lists: { ...registry.lists },
        saved: { ...(registry.saved || {}) },
    };
    change(draft);
    registry = draft;
    dbPut('meta', RECORD_KEY, registry).catch(() => { /* not saved; kept for this visit */ });
    listeners.forEach((fn) => fn(registry));
}

/** Call `fn(registry)` on every change. */
export function onRegistryChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Reset to nothing downloaded (on log out). */
export function resetRegistry() {
    updateRegistry((draft) => { draft.notebooks = {}; draft.items = {}; draft.lists = {}; draft.saved = {}; });
}

// --- Questions about a registry (the live one, or the Redux copy) ----------

/**
 * Every item key that's downloaded: one by one, or in a whole notebook.
 * @returns {Set<string>}
 */
export function coveredKeys(reg = registry) {
    const keys = new Set(Object.keys(reg.items || {}));
    Object.keys(reg.notebooks || {}).forEach((name) => {
        ((reg.lists || {})[name] || []).forEach((key) => keys.add(key));
    });
    return keys;
}

/** Is this item (a key like "card:<id>") downloaded? */
export function isCovered(key, reg = registry) {
    if (!key) return false;
    if ((reg.items || {})[key]) return true;
    return Object.keys(reg.notebooks || {}).some((name) => ((reg.lists || {})[name] || []).includes(key));
}

/**
 * Can this item be opened offline? Only if its text is actually on the
 * device (`saved`) — not merely because it belongs to a notebook whose
 * download started. (`notebook` is kept for callers; it doesn't matter.)
 */
export function isItemAvailable(reg, notebook, key) {
    return !!(reg.saved || {})[key];
}

/**
 * How much of a notebook is downloaded:
 *   'full'        downloaded whole, and the download finished
 *   'downloading' downloaded whole, but not finished yet (in progress, or
 *                 interrupted: it resumes when there's a connection)
 *   'partial'     some of its notes/words are on the device (one by one, or
 *                 with another notebook)
 *   null          nothing
 */
export function notebookStatus(reg, notebook) {
    const whole = (reg.notebooks || {})[notebook];
    if (whole) return whole.complete ? 'full' : 'downloading';
    const list = (reg.lists || {})[notebook] || [];
    return list.some((key) => (reg.saved || {})[key]) ? 'partial' : null;
}
