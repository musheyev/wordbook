import { dbGet, dbPut } from './db';
import { isOnline, offlineEnabled } from './network';

// Saved copies of API answers, so the app can show them with no connection.
//
// It works at the level of axios, the library every API request goes
// through (main.jsx creates it). axios lets us register "interceptors":
// functions that run on every request before it's sent, and on every answer
// before the code that asked sees it. So the rest of the app doesn't change:
// a screen that loads a notebook still calls /wordbook/words, and gets either
// the server's answer or, offline, the copy saved last time.
//
//   Answer arrives      if the request is one we keep (RULES below), save the
//                       answer in IndexedDB (offline/db.js "responses").
//   No connection       answer from the saved copy without sending anything
//                       (axios's "adapter" is the part that actually sends;
//                       we swap in one that reads the copy). Nothing saved,
//                       or a change (save, delete…): fail at once with
//                       "You're offline", instead of waiting for a timeout.
//   Connection dropped  a request that fails without an answer falls back to
//                       the saved copy too.
//
// What's kept:
//   always    small lists that make the app work at all offline: who's
//             signed in, the notebook names, each notebook's item list
//             (titles), sorts, colours, tags.
//   per item  a note's or word's content, only when that note or word is
//             downloaded (offline/downloads.js decides, through `isCovered`).
//             The download itself sends its requests with `offlineSave: true`.

/**
 * Which requests are kept, and what they belong to. Each rule gets the
 * request's method, path (without "/" or query) and its query/body values,
 * and returns null (not kept), { always: true } or { item: "<type>:<id>" }.
 * The download (offline/downloads.js) must ask with exactly the same URLs and
 * bodies as the app's own actions, so both end up under the same key.
 */
const ALWAYS_GET = new Set(['auth/current_user', 'wordbook/list', 'wordbook/sort', 'wordbook/item-sorts',
    'wordbook/item-colors', 'tags/all']);
function classify(method, path, query, body) {
    if (method === 'get' && ALWAYS_GET.has(path)) return { always: true };
    if (method === 'post' && path === 'wordbook/words') return { always: true, notebook: body.wordbook };
    if (method === 'post' && path === 'wordbook/card/get' && body.card_id) return { item: `card:${body.card_id}` };
    if (method === 'get' && path === 'dictionary' && query.search && query.json === 'y') return { item: `word:${query.search}` };
    if (method === 'get' && path === 'dictionary/note' && query.word) return { item: `word:${query.word}` };
    if (method === 'get' && path === 'tags' && query.type && query.id) return { item: `${query.type}:${query.id}` };
    return null;
}

/**
 * Describe an axios request: its storage key and the rule it falls under.
 * The key is the method, URL and body, e.g.
 *   "post wordbook/card/get {"card_id":"abc"}"
 * so the same request always finds the same saved answer.
 *
 * @param {import('axios').InternalAxiosRequestConfig} config
 * @returns {{ key: string, rule: object|null }}
 */
export function describeRequest(config) {
    const method = (config.method || 'get').toLowerCase();
    const [rawPath, rawQuery = ''] = (config.url || '').replace(/^\/+/, '').split('?');
    const query = Object.fromEntries(new URLSearchParams(rawQuery));
    Object.entries(config.params || {}).forEach(([k, v]) => { if (v !== undefined) query[k] = String(v); });
    // Before sending, `data` is the object the caller passed; on a retry it's
    // already the JSON text axios made of it.
    let bodyText = '';
    let body = {};
    if (config.data != null) {
        bodyText = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
        try { body = JSON.parse(bodyText) || {}; } catch (e) { body = {}; }
    }
    const queryText = new URLSearchParams(query).toString();
    const key = `${method} ${rawPath}${queryText ? `?${queryText}` : ''} ${bodyText}`;
    return { key, rule: classify(method, rawPath, query, body) };
}

/**
 * The saved-copy key for a request, built like the app's own requests, e.g.
 * savedKey('post', '/wordbook/card/get', { card_id: 'abc' }). Used to change
 * saved copies directly (offline/outbox.js applies offline edits to them).
 */
export const savedKey = (method, url, data) => describeRequest({ method, url, data }).key;

/** An error like axios's own for "no answer", marked as offline. */
function offlineError(config) {
    const err = new Error("You're offline.");
    err.config = config;
    err.code = 'ERR_NETWORK';
    err.isOffline = true;
    return err;
}

/** An axios-style answer made from a saved copy. */
const savedAnswer = (config, saved) => ({
    data: saved.data, status: 200, statusText: 'OK', headers: {}, config, request: {}, fromSavedCopy: true,
});

/**
 * Install the interceptors on the app's axios instance (main.jsx). Does
 * nothing unless offline features are on (offline/network.js).
 *
 * @param {import('axios').AxiosInstance} api
 * @param {object} hooks from offline/downloads.js
 * @param {(item: string) => boolean} hooks.isCovered is this item downloaded?
 * @param {(notebook: string, items: object[]) => void} hooks.onNotebookList a
 *   notebook's item list just arrived from the server
 * @param {(item: string) => boolean} hooks.isPending does this item have
 *   offline changes not yet sent?
 */
export function installApiCache(api, { isCovered, onNotebookList, isPending }) {
    if (!offlineEnabled()) return;

    api.interceptors.request.use((config) => {
        const { key, rule } = describeRequest(config);
        config.offlineKey = key;
        config.offlineRule = rule;
        if (!isOnline()) {
            config.adapter = async () => {
                const saved = rule && await dbGet('responses', key).catch(() => null);
                if (saved) return savedAnswer(config, saved);
                throw offlineError(config);
            };
        }
        return config;
    });

    api.interceptors.response.use((res) => {
        const { offlineKey: key, offlineRule: rule } = res.config || {};
        if (!rule || res.fromSavedCopy) return res;
        if (rule.notebook && Array.isArray(res.data)) onNotebookList(rule.notebook, res.data);
        // A note with offline changes not yet sent keeps the phone's copy
        // (offline/outbox.js), until they're sent.
        if (rule.item && isPending(rule.item)) return res;
        if (rule.always || isCovered(rule.item) || res.config.offlineSave) {
            const record = { data: res.data, savedAt: Date.now(), items: rule.item ? [rule.item] : [] };
            dbPut('responses', key, record).catch(() => { /* storage full: just not saved */ });
        }
        return res;
    }, async (error) => {
        // The connection dropped mid-way (no answer at all): use a saved copy.
        const config = error.config || {};
        if (!error.response && !error.isOffline && config.offlineRule) {
            const saved = await dbGet('responses', config.offlineKey).catch(() => null);
            if (saved) return savedAnswer(config, saved);
        }
        throw error;
    });
}
