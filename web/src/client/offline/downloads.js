import { cardChunks, wordTitleChunk } from '../utils/tts';
import { installApiCache } from './apiCache';
import { saveChunksAudio } from './audio';
import { dbClear, dbDeleteWhere, STORES } from './db';
import { saveNoteImages } from './images';
import { isOnline, offlineEnabled, onConnectionChange } from './network';
import { installOutbox, pendingKeys, syncOutbox } from './outbox';
import {
    coveredKeys, getRegistry, isCovered, loadRegistry, onRegistryChange, resetRegistry, updateRegistry,
} from './registry';

// Downloading notebooks and notes to the phone, and keeping them up to date.
//
//   Download a notebook   its item list, then every note and word in it, in
//                         two passes: first all the text (and tags), which
//                         is quick, so reading works offline almost at once;
//                         then the notes' images and the audio Play all
//                         would read (a word: just the word), which is slow.
//                         It counts as downloaded (the ↓) only when both
//                         passes are done; an interrupted one (app closed,
//                         no connection) resumes when there's a connection.
//                         Offline, a notebook shows only the items whose text
//                         arrived (registry `saved`).
//   Download notes        the same, for chosen notes/words only. They then show
//                         offline in every notebook they belong to.
//   Remove download       forget it, then delete whatever no other download
//                         still needs. The notebook or note itself is untouched.
//   Keeping up to date    when the app starts or the connection comes back
//                         (at most every 15 minutes), downloads are fetched
//                         again: changed text replaces the old, new notes in
//                         a downloaded notebook are added, audio and images
//                         already saved aren't fetched again.
//   Remove all downloads  every download at once (My Notebooks). Notes
//                         written or edited offline and not yet sent stay.
//   Log out               everything offline is deleted (it's the account's).
//
// Changes made offline are in offline/outbox.js. They're sent before
// downloads are refreshed, so a refresh never replaces an edit not yet sent.
//
// The text is saved by offline/apiCache.js as the requests answer (the
// download sends them with `offlineSave: true`), so they must be the same
// requests the app's actions send (actions/index.js). Progress and the
// registry (what's downloaded: offline/registry.js) are mirrored into Redux
// (reducers/offlineReducer.js) for the screens.

export const OFFLINE_STATE = 'offline_state';

const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };
const SAVE = { offlineSave: true };
const REFRESH_EVERY_MS = 15 * 60 * 1000;

let api = null;
let dispatch = () => {};
let lastRefresh = 0;
const progress = {}; // target ("notebook:<name>" | "items") -> { done, total, error? }

const keyOf = (item) => `${item.type}:${item.id}`;
const publishProgress = () => dispatch({ type: OFFLINE_STATE, payload: { progress: { ...progress } } });

/**
 * Start offline features (main.jsx, before the first screen): load what's
 * downloaded, save copies of API answers, follow the connection, and keep
 * downloads up to date. Does nothing unless offline features are on.
 *
 * @param {import('redux').Store} store
 * @param {import('axios').AxiosInstance} axiosInstance
 * @returns {Promise<void>} once the registry is loaded
 */
export async function installOffline(store, axiosInstance) {
    if (!offlineEnabled()) return;
    api = axiosInstance;
    dispatch = store.dispatch;
    installApiCache(api, { isCovered, onNotebookList, isPending: (key) => pendingKeys().has(key) });
    onRegistryChange((reg) => dispatch({ type: OFFLINE_STATE, payload: { registry: reg } }));
    onConnectionChange((online) => {
        dispatch({ type: OFFLINE_STATE, payload: { online } });
        if (online) catchUp();
    });
    dispatch({ type: OFFLINE_STATE, payload: { enabled: true, online: isOnline() } });
    // Ask the system to treat this storage as the user's data, not a cache
    // it may clear when the device is short of space (best effort).
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    await loadRegistry();
    await installOutbox({
        api,
        publish: (payload) => dispatch({ type: OFFLINE_STATE, payload }),
        // Changes were sent: refresh downloads, and let screens reload
        // (pages/WordbookPage.js listens).
        afterSync: () => {
            refreshDownloads({ force: true });
            window.dispatchEvent(new CustomEvent('offline-synced'));
        },
    });
    // Once the app has settled: send offline changes, then refresh downloads.
    setTimeout(catchUp, 5000);
}

/**
 * Online (again): send changes made offline, then refresh downloads. Also
 * saves My Notebooks' list (names and previews), so it shows offline even
 * if My Notebooks wasn't opened since (offline/apiCache.js keeps the answers).
 */
async function catchUp() {
    await syncOutbox().catch(() => {});
    await Promise.all([api.get('/wordbook/list'), api.get('/wordbook/list?preview=y')]).catch(() => {});
    await resumeDownloads().catch(() => {});
    refreshDownloads();
}

/**
 * A notebook's item list arrived (apiCache.js): remember which items it has,
 * and if the whole notebook is downloaded, download what's new in it.
 */
function onNotebookList(name, items) {
    const keys = items.map(keyOf);
    const before = new Set(getRegistry().lists[name] || []);
    if (keys.length === before.size && keys.every((k) => before.has(k))) return;
    updateRegistry((draft) => { draft.lists[name] = keys; });
    // (Not while it's being downloaded: that download saves everything.)
    if (getRegistry().notebooks[name] && !running.has(`notebook:${name}`)) {
        const added = items.filter((item) => !before.has(keyOf(item)));
        if (added.length) saveItemsQuietly(added);
        else collectGarbage(); // items removed from the notebook
    }
}

/** Mark items' text as on the device (they can be opened offline). */
const markSaved = (keys) => updateRegistry((draft) => { keys.forEach((key) => { draft.saved[key] = true; }); });

/**
 * First pass for one note or word: its text and tags (quick).
 * @returns {Promise<string>} a note's content (for the second pass), '' for a word
 */
async function saveText(item) {
    let content = '';
    if (item.type === 'card') {
        const res = await api.post('/wordbook/card/get', { card_id: item.id }, { ...JSON_HEADERS, ...SAVE });
        content = (res.data && res.data.content) || '';
    } else {
        await api.get(`/dictionary?search=${encodeURIComponent(item.id)}&json=y`, SAVE);
    }
    await api.get(`/tags?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`, SAVE)
        .catch(() => { /* tags are a nicety */ });
    markSaved([keyOf(item)]);
    return content;
}

/**
 * Second pass for one note or word: a note's images and its read-aloud audio
 * (slow: one request per sentence not saved yet).
 */
async function saveExtras(item, content) {
    const key = keyOf(item);
    if (item.type === 'card') {
        await saveNoteImages(content, key);
        await saveChunksAudio(cardChunks({ card_id: item.id, content }), key);
    } else if (item.title) {
        // Play all reads the word as listed (its title); without the title
        // (a refresh of a word downloaded on its own) the audio saved at
        // download time stays.
        await saveChunksAudio([wordTitleChunk(item)], key);
    }
}

/** Download one note or word, both passes. */
async function saveItem(item) {
    await saveExtras(item, await saveText(item));
}

// Downloads under way ("notebook:<name>" or "items"), so one isn't started
// twice (e.g. resumed while still running).
const running = new Set();

/**
 * Download items in two passes, counting progress under `target`:
 *   { phase: 'text' | 'audio', done, total }
 * Shown only if `show`; a quiet refresh doesn't show progress.
 *
 * @returns {Promise<boolean>} whether everything arrived
 */
async function saveItems(items, target, { show = true } = {}) {
    const set = (value) => { if (show) { progress[target] = value; publishProgress(); } };
    const contents = new Map();
    try {
        set({ phase: 'text', done: 0, total: items.length });
        for (let i = 0; i < items.length; i++) {
            contents.set(keyOf(items[i]), await saveText(items[i]));
            set({ phase: 'text', done: i + 1, total: items.length });
        }
        set({ phase: 'audio', done: 0, total: items.length });
        for (let i = 0; i < items.length; i++) {
            await saveExtras(items[i], contents.get(keyOf(items[i])));
            set({ phase: 'audio', done: i + 1, total: items.length });
        }
        if (show) { delete progress[target]; publishProgress(); }
        return true;
    } catch (err) {
        if (show) {
            progress[target] = { ...(progress[target] || {}), error: "The download didn't finish. It continues when you're online." };
            publishProgress();
        }
        return false;
    }
}

const saveItemsQuietly = (items) => {
    (async () => { for (const item of items) await saveItem(item).catch(() => {}); })();
};

/**
 * Download a whole notebook (or resume one that didn't finish). Recorded at
 * the start (so notes opened meanwhile are kept too) but only `complete`
 * once both passes are done.
 *
 * @param {string} name
 * @param {{ show?: boolean }} [opts] show progress (not for a quiet refresh)
 */
export async function downloadNotebook(name, { show = true } = {}) {
    const target = `notebook:${name}`;
    if (running.has(target)) return;
    running.add(target);
    const wasComplete = !!(getRegistry().notebooks[name] || {}).complete;
    updateRegistry((draft) => {
        draft.notebooks[name] = { at: (draft.notebooks[name] || {}).at || Date.now(), complete: wasComplete && !show };
    });
    if (show) { progress[target] = { phase: 'text', done: 0, total: 0 }; publishProgress(); }
    try {
        let items;
        try {
            items = (await api.post('/wordbook/words', { wordbook: name }, { ...JSON_HEADERS, ...SAVE })).data || [];
        } catch (err) {
            if (show) {
                progress[target] = { done: 0, total: 0, error: "The download didn't start. Check your connection." };
                publishProgress();
            }
            return;
        }
        const ok = await saveItems(items, target, { show });
        if (ok && getRegistry().notebooks[name]) {
            updateRegistry((draft) => { draft.notebooks[name] = { ...draft.notebooks[name], complete: true }; });
        }
    } finally {
        running.delete(target);
    }
}

/**
 * Download chosen notes/words (a note's ↓, or Select → Download). Also
 * learns the item lists of the user's other notebooks (once), so the notes
 * show offline in every notebook that has them.
 *
 * @param {object[]} items
 */
export async function downloadItems(items) {
    updateRegistry((draft) => {
        items.forEach((item) => { draft.items[keyOf(item)] = { at: Date.now(), complete: false }; });
    });
    const ok = await saveItems(items, 'items');
    if (ok) {
        updateRegistry((draft) => {
            items.forEach((item) => {
                const key = keyOf(item);
                if (draft.items[key]) draft.items[key] = { ...draft.items[key], complete: true };
            });
        });
    }
    learnAllNotebookLists();
}

async function learnAllNotebookLists() {
    try {
        const names = (await api.get('/wordbook/list')).data || [];
        for (const name of names) {
            if (!getRegistry().lists[name]) await api.post('/wordbook/words', { wordbook: name }, JSON_HEADERS);
        }
    } catch (err) { /* next time */ }
}

/** Remove a notebook's download (the notebook itself stays in the account). */
export function removeNotebookDownload(name) {
    updateRegistry((draft) => { delete draft.notebooks[name]; });
    delete progress[`notebook:${name}`];
    publishProgress();
    return collectGarbage();
}

/** Remove the download of notes/words downloaded one by one. */
export function removeItemDownloads(items) {
    updateRegistry((draft) => { items.forEach((item) => { delete draft.items[keyOf(item)]; }); });
    return collectGarbage();
}

/** Clear a failed download's message. */
export function dismissDownloadError(target) {
    delete progress[target];
    publishProgress();
}

/**
 * Delete saved text, images and audio that no download needs any more.
 * Records belong to items (`items`); "always" records (lists, who's signed
 * in) belong to none and stay.
 */
async function collectGarbage() {
    const covered = coveredKeys();
    pendingKeys().forEach((key) => covered.add(key)); // changes not yet sent
    const unused = (record) => Array.isArray(record.items) && record.items.length > 0
        && !record.items.some((key) => covered.has(key));
    // Items no download needs any more aren't "on the device" either.
    if (Object.keys(getRegistry().saved || {}).some((key) => !covered.has(key))) {
        updateRegistry((draft) => {
            Object.keys(draft.saved).forEach((key) => { if (!covered.has(key)) delete draft.saved[key]; });
        });
    }
    await Promise.all(['responses', 'audio', 'images'].map((store) => dbDeleteWhere(store, unused).catch(() => 0)));
}

/**
 * Carry on with downloads that didn't finish (the app was closed, the phone
 * slept, the connection went). Runs at start-up and whenever the connection
 * returns, with progress showing as when they started.
 */
export async function resumeDownloads() {
    if (!api || !isOnline()) return;
    const reg = getRegistry();
    for (const name of Object.keys(reg.notebooks)) {
        if (!reg.notebooks[name].complete) await downloadNotebook(name);
    }
    // Not marked complete (including downloads from before completion was
    // tracked); notes written offline (`local`) aren't downloads.
    const unfinished = Object.keys(reg.items).filter((key) => reg.items[key].complete !== true && !reg.items[key].local);
    if (unfinished.length && !running.has('items')) {
        running.add('items');
        try {
            await downloadItems(unfinished.map((key) => {
                const [type, ...rest] = key.split(':');
                return { type, id: rest.join(':') };
            }));
        } finally {
            running.delete('items');
        }
    }
}

/**
 * Fetch finished downloads again (see "Keeping up to date" above), quietly.
 * Runs at start-up and when the connection returns, at most every 15 minutes.
 */
export async function refreshDownloads({ force = false } = {}) {
    if (!api || !isOnline() || (!force && Date.now() - lastRefresh < REFRESH_EVERY_MS)) return;
    lastRefresh = Date.now();
    const reg = getRegistry();
    const done = new Set();
    try {
        // Whole notebooks: their current list (new items are picked up by
        // onNotebookList), then each item again.
        for (const name of Object.keys(reg.notebooks)) {
            if (!reg.notebooks[name].complete || running.has(`notebook:${name}`)) continue; // resumeDownloads' job
            const items = (await api.post('/wordbook/words', { wordbook: name }, { ...JSON_HEADERS, ...SAVE })).data || [];
            for (const item of items) {
                if (done.has(keyOf(item))) continue;
                await saveItem(item);
                done.add(keyOf(item));
            }
        }
        // Notes and words downloaded on their own.
        for (const key of Object.keys(reg.items)) {
            if (done.has(key) || reg.items[key].complete !== true) continue; // resumeDownloads' job (or written offline)
            const [type, ...rest] = key.split(':');
            await saveItem({ type, id: rest.join(':') });
        }
        await collectGarbage();
    } catch (err) { /* offline again: next time */ }
}

/** A notebook was renamed: its download and list follow the new name. */
export function notebookRenamed(from, to) {
    if (!offlineEnabled()) return;
    updateRegistry((draft) => {
        if (draft.notebooks[from]) { draft.notebooks[to] = draft.notebooks[from]; delete draft.notebooks[from]; }
        if (draft.lists[from]) { draft.lists[to] = draft.lists[from]; delete draft.lists[from]; }
    });
}

/** A notebook was deleted: forget it and what only it needed. */
export function notebookDeleted(name) {
    if (!offlineEnabled()) return;
    updateRegistry((draft) => { delete draft.notebooks[name]; delete draft.lists[name]; });
    collectGarbage();
}

/** A note was deleted: forget its download. */
export function itemDeleted(key) {
    if (!offlineEnabled()) return;
    updateRegistry((draft) => { delete draft.items[key]; delete draft.saved[key]; });
    collectGarbage();
}

/**
 * Remove every download (My Notebooks → Remove all downloads). Only the
 * device's copies; notes written offline and not yet sent are kept.
 */
export function removeAllDownloads() {
    const pending = pendingKeys();
    updateRegistry((draft) => {
        draft.notebooks = {};
        Object.keys(draft.items).forEach((key) => { if (!pending.has(key)) delete draft.items[key]; });
        Object.keys(draft.saved).forEach((key) => { if (!pending.has(key)) delete draft.saved[key]; });
    });
    Object.keys(progress).forEach((target) => { delete progress[target]; });
    publishProgress();
    return collectGarbage();
}

/**
 * Roughly how much this app stores on the device (downloads and saved
 * copies), in bytes, or null if the browser can't say.
 */
export async function storageUsed() {
    try {
        const { usage } = await navigator.storage.estimate();
        return typeof usage === 'number' ? usage : null;
    } catch (err) {
        return null;
    }
}

/**
 * Log out (or account deleted): delete everything offline on this device.
 * @param {{ send?: boolean }} [opts] send offline changes first (if there's a
 *   connection); not when the account was just deleted
 */
export async function clearOfflineData({ send = true } = {}) {
    if (!offlineEnabled()) return;
    if (send) await syncOutbox().catch(() => {});
    resetRegistry();
    await Promise.all(STORES.map((store) => dbClear(store).catch(() => {})));
}
