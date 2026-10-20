import { dbGet, dbPut } from './db';

// What's downloaded on this device — the "registry" — and questions about it.
//
// It's kept in IndexedDB (offline/db.js, "meta" store, one record) so it
// survives restarts, and mirrored into the Redux store (reducers/
// offlineReducer.js) so screens redraw when it changes. Item keys are
// "<type>:<id>", e.g. "card:3f2a…" for a note, "word:serendipity".
//
//   notebooks  { [name]: { at } }  notebooks downloaded whole: everything in
//                                 them, including items added later
//   items      { [key]:  { at } }  notes/words downloaded one by one
//   lists      { [name]: [keys] }  each notebook's items as last seen from
//                                 the server (any notebook opened on this
//                                 device). Tells which notebooks a
//                                 downloaded note belongs to, and how many
//                                 items aren't downloaded.
const RECORD_KEY = 'registry';
const EMPTY = { notebooks: {}, items: {}, lists: {} };

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
    updateRegistry((draft) => { draft.notebooks = {}; draft.items = {}; draft.lists = {}; });
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
 * Can this item be opened offline in `notebook`? Yes if the notebook is
 * downloaded, or the item is — on its own, or with another notebook it's in.
 */
export function isItemAvailable(reg, notebook, key) {
    return !!((reg.notebooks || {})[notebook] || isCovered(key, reg));
}

/**
 * How much of a notebook is downloaded: 'full' (the whole notebook), 'partial'
 * (some of its notes/words are, one by one or with another notebook) or null.
 */
export function notebookStatus(reg, notebook) {
    if ((reg.notebooks || {})[notebook]) return 'full';
    const list = (reg.lists || {})[notebook] || [];
    const covered = coveredKeys(reg);
    return list.some((key) => covered.has(key)) ? 'partial' : null;
}
