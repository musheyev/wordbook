import { cardChunks, wordTitleChunk } from '../utils/tts';
import { installApiCache } from './apiCache';
import { saveChunksAudio } from './audio';
import { dbClear, dbDeleteWhere, STORES } from './db';
import { saveNoteImages } from './images';
import { isOnline, offlineEnabled, onConnectionChange } from './network';
import {
    coveredKeys, getRegistry, isCovered, loadRegistry, onRegistryChange, resetRegistry, updateRegistry,
} from './registry';

// Downloading notebooks and notes to the phone, and keeping them up to date.
//
//   Download a notebook   its item list, then every note and word in it: the
//                         text (and tags), the note's images, and the audio
//                         Play all would read (a word: just the word).
//   Download notes        the same, for chosen notes/words only. They then show
//                         offline in every notebook they belong to.
//   Remove download       forget it, then delete whatever no other download
//                         still needs. The notebook or note itself is untouched.
//   Keeping up to date    when the app starts or the connection comes back
//                         (at most every 15 minutes), downloads are fetched
//                         again: changed text replaces the old, new notes in
//                         a downloaded notebook are added, audio and images
//                         already saved aren't fetched again.
//   Log out               everything offline is deleted (it's the account's).
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
    installApiCache(api, { isCovered, onNotebookList });
    onRegistryChange((reg) => dispatch({ type: OFFLINE_STATE, payload: { registry: reg } }));
    onConnectionChange((online) => {
        dispatch({ type: OFFLINE_STATE, payload: { online } });
        if (online) refreshDownloads();
    });
    dispatch({ type: OFFLINE_STATE, payload: { enabled: true, online: isOnline() } });
    // Ask the system to treat this storage as the user's data, not a cache
    // it may clear when the device is short of space (best effort).
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    await loadRegistry();
    // Bring downloads up to date once the app has settled.
    setTimeout(() => refreshDownloads(), 5000);
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
    if (getRegistry().notebooks[name] && !progress[`notebook:${name}`]) {
        const added = items.filter((item) => !before.has(keyOf(item)));
        if (added.length) saveItemsQuietly(added);
        else collectGarbage(); // items removed from the notebook
    }
}

/**
 * Download one note or word: text and tags, the note's images, its audio.
 * @param {{type: string, id: string, title: string}} item
 */
async function saveItem(item) {
    const key = keyOf(item);
    if (item.type === 'card') {
        const res = await api.post('/wordbook/card/get', { card_id: item.id }, { ...JSON_HEADERS, ...SAVE });
        const content = (res.data && res.data.content) || '';
        await saveNoteImages(content, key);
        await saveChunksAudio(cardChunks({ card_id: item.id, content }), key);
    } else {
        await api.get(`/dictionary?search=${encodeURIComponent(item.id)}&json=y`, SAVE);
        // Play all reads the word as listed (its title); without the title
        // (a refresh of a word downloaded on its own) the audio saved at
        // download time stays.
        if (item.title) await saveChunksAudio([wordTitleChunk(item)], key);
    }
    await api.get(`/tags?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`, SAVE)
        .catch(() => { /* tags are a nicety */ });
}

/** Download items one after another, counting progress under `target`. */
async function saveItems(items, target) {
    progress[target] = { done: 0, total: items.length };
    publishProgress();
    try {
        for (const item of items) {
            await saveItem(item);
            progress[target] = { done: progress[target].done + 1, total: items.length };
            publishProgress();
        }
        delete progress[target];
        publishProgress();
        return true;
    } catch (err) {
        progress[target] = { ...progress[target], error: "The download didn't finish. Try again when you're online." };
        publishProgress();
        return false;
    }
}

const saveItemsQuietly = (items) => {
    (async () => { for (const item of items) await saveItem(item).catch(() => {}); })();
};

/**
 * Download a whole notebook. Marked as downloaded at the start, so notes
 * opened meanwhile are saved too; if it doesn't finish, the menu offers to
 * try again.
 *
 * @param {string} name
 */
export async function downloadNotebook(name) {
    updateRegistry((draft) => { draft.notebooks[name] = { at: Date.now() }; });
    const target = `notebook:${name}`;
    progress[target] = { done: 0, total: 0 };
    publishProgress();
    let items;
    try {
        items = (await api.post('/wordbook/words', { wordbook: name }, { ...JSON_HEADERS, ...SAVE })).data || [];
    } catch (err) {
        progress[target] = { done: 0, total: 0, error: "The download didn't start. Check your connection." };
        publishProgress();
        return;
    }
    await saveItems(items, target);
}

/**
 * Download chosen notes/words (a note's ↓, or Select → Download). Also
 * learns the item lists of the user's other notebooks (once), so the notes
 * show offline in every notebook that has them.
 *
 * @param {object[]} items
 */
export async function downloadItems(items) {
    updateRegistry((draft) => { items.forEach((item) => { draft.items[keyOf(item)] = { at: Date.now() }; }); });
    await saveItems(items, 'items');
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
    const unused = (record) => Array.isArray(record.items) && record.items.length > 0
        && !record.items.some((key) => covered.has(key));
    await Promise.all(['responses', 'audio', 'images'].map((store) => dbDeleteWhere(store, unused).catch(() => 0)));
}

/**
 * Fetch every download again (see "Keeping up to date" above). Runs at
 * start-up and when the connection returns, at most every 15 minutes.
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
            const items = (await api.post('/wordbook/words', { wordbook: name }, { ...JSON_HEADERS, ...SAVE })).data || [];
            for (const item of items) {
                if (done.has(keyOf(item))) continue;
                await saveItem(item);
                done.add(keyOf(item));
            }
        }
        // Notes and words downloaded on their own.
        for (const key of Object.keys(reg.items)) {
            if (done.has(key)) continue;
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
    updateRegistry((draft) => { delete draft.items[key]; });
    collectGarbage();
}

/** Log out: delete everything offline on this device. */
export async function clearOfflineData() {
    if (!offlineEnabled()) return;
    resetRegistry();
    await Promise.all(STORES.map((store) => dbClear(store).catch(() => {})));
}
