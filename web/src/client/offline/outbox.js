import { savedKey } from './apiCache';
import { dbGet, dbPut, dbDelete } from './db';
import { isOnline, offlineEnabled } from './network';
import { getRegistry, updateRegistry } from './registry';

// Changes made offline (step 9): kept in an "outbox" and sent when the
// connection returns.
//
// What can be changed offline: a downloaded note's text and title, a new
// note, colours and tags. (Deleting, renaming notebooks and adding words
// still need a connection: they're harder to undo if something goes wrong.)
//
//   1. The change is applied on the phone at once: the saved copies the app
//      reads offline (offline/apiCache.js) are updated, so the note shows
//      its new text, the notebook its new title, and so on. A new note gets
//      a temporary id ("local-…") until the server gives it a real one.
//   2. The change goes in the outbox (IndexedDB "meta" store), in order.
//      Several edits to the same note while offline become one.
//   3. Back online (or at start-up), the outbox is sent, oldest first. A
//      change the server refuses is dropped, with a notice; with no answer
//      at all, sending stops and is tried again later.
//
// The latest change wins (the user's decision). Notes carry the time they
// were last saved (`updated_datetime`, from the server). Before sending an
// offline edit, the app fetches the note:
//   saved on the server after the offline edit  -> the server's copy is newer
//                                                  and kept; a notice says so
//   otherwise                                   -> the offline edit is saved;
//      if the server's copy had changed since the phone's copy was taken,
//      a notice says the offline edit replaced it.
// Times compare as ISO-8601 text ("2026-10-19T17:02:11.000Z"), which sorts
// the same as the times themselves.

const RECORD_KEY = 'outbox';
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

let api = null;
let publish = () => {};
let afterSync = () => {};
let outbox = [];
let syncing = false;
let notices = [];

/** Are changes being kept for later right now (offline features on, no connection)? */
export const isQueueing = () => offlineEnabled() && !isOnline();

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const plainText = (html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};
const cardKey = (id) => `card:${id}`;

/** Item keys ("card:<id>", …) with changes waiting to be sent. */
export function pendingKeys() {
    const keys = new Set();
    outbox.forEach((e) => {
        if (e.kind === 'card-update') keys.add(cardKey(e.cardId));
        if (e.kind === 'card-create') keys.add(cardKey(e.tempId));
        if (e.kind === 'tags') keys.add(`${e.type}:${e.itemId}`);
    });
    return keys;
}

function publishState() {
    publish({
        outbox: { count: outbox.length, pending: [...pendingKeys()], syncing },
        notices: [...notices],
    });
}

async function saveOutbox() {
    await dbPut('meta', RECORD_KEY, outbox).catch(() => {});
    publishState();
}

/** Show a notice (OfflineBar). */
function notice(text) {
    notices = [...notices, { id: newId(), text }];
    publishState();
}

/** Close a notice. */
export function dismissNotice(id) {
    notices = notices.filter((n) => n.id !== id);
    publishState();
}

/**
 * Start (offline/downloads.js installOffline): load the outbox.
 *
 * @param {object} opts
 * @param {import('axios').AxiosInstance} opts.api
 * @param {(payload: object) => void} opts.publish puts state into Redux
 * @param {() => void} opts.afterSync called after changes were sent
 */
export async function installOutbox(opts) {
    ({ api, publish, afterSync } = opts);
    outbox = (await dbGet('meta', RECORD_KEY).catch(() => null)) || [];
    publishState();
}

// --- Changing the phone's saved copies -------------------------------------

/** Change a saved answer in place: `change(data)` returns the new data. */
async function patchSaved(key, change, items = []) {
    const record = await dbGet('responses', key).catch(() => null);
    const data = change(record ? record.data : undefined);
    if (data === undefined) return;
    await dbPut('responses', key, { data, savedAt: Date.now(), items: record ? record.items : items });
}

const cardRecord = (id) => savedKey('post', '/wordbook/card/get', { card_id: id });
const listRecord = (notebook) => savedKey('post', '/wordbook/words', { wordbook: notebook });

/** Update a note's title and preview in every saved notebook list that has it. */
async function patchLists(id, title, content) {
    const lists = getRegistry().lists;
    const names = Object.keys(lists).filter((name) => lists[name].includes(cardKey(id)));
    for (const name of names) {
        await patchSaved(listRecord(name), (items) => (Array.isArray(items)
            ? items.map((item) => (item.type === 'card' && item.id === id
                ? { ...item, title, preview: plainText(content).slice(0, 100) } : item))
            : undefined));
    }
}

// --- Keeping changes for later (called by actions/index.js) ----------------

/**
 * Edit a note offline.
 * @returns {Promise<{card_id, title, content}>} the note as now shown
 */
export async function queueCardUpdate(cardId, title, content) {
    const editedAt = new Date().toISOString();
    const created = outbox.find((e) => e.kind === 'card-create' && e.tempId === cardId);
    const earlier = outbox.find((e) => e.kind === 'card-update' && e.cardId === cardId);
    let baseUpdated = null;
    await patchSaved(cardRecord(cardId), (card) => {
        baseUpdated = (card && card.updated_datetime) || null;
        return { ...(card || {}), card_id: cardId, title, content };
    }, [cardKey(cardId)]);
    if (created) {
        Object.assign(created, { title, content });
    } else if (earlier) {
        Object.assign(earlier, { title, content, editedAt });
    } else {
        outbox.push({ id: newId(), kind: 'card-update', cardId, title, content, editedAt, baseUpdated });
    }
    await patchLists(cardId, title, content);
    await saveOutbox();
    return { card_id: cardId, title, content };
}

/**
 * Write a new note offline, in the given notebooks. It's kept on the phone
 * (as if downloaded) under a temporary id.
 * @returns {Promise<{card_id, title, content}>}
 */
export async function queueCardCreate(title, content, wordbooks) {
    const tempId = `local-${newId()}`;
    const key = cardKey(tempId);
    await dbPut('responses', cardRecord(tempId), {
        data: { card_id: tempId, title, content, updated_datetime: null }, savedAt: Date.now(), items: [key],
    });
    const preview = plainText(content).slice(0, 100);
    for (const name of wordbooks) {
        await patchSaved(listRecord(name), (items) => [...(Array.isArray(items) ? items : []),
            { type: 'card', id: tempId, title, preview }]);
    }
    updateRegistry((draft) => {
        draft.items[key] = { at: Date.now(), local: true };
        wordbooks.forEach((name) => { draft.lists[name] = [...(draft.lists[name] || []), key]; });
    });
    outbox.push({ id: newId(), kind: 'card-create', tempId, title, content, wordbooks, createdAt: new Date().toISOString() });
    await saveOutbox();
    return { card_id: tempId, title, content };
}

/** Colour items offline. `colors` is the whole colour map after the change. */
export async function queueItemColors(items, color, colors) {
    await patchSaved(savedKey('get', '/wordbook/item-colors'), () => ({ colors }));
    outbox.push({ id: newId(), kind: 'colors', items: items.map(({ type, id }) => ({ type, id })), color: color || null });
    await saveOutbox();
}

/** Set an item's tags offline. */
export async function queueItemTags(type, itemId, tags, title) {
    await patchSaved(savedKey('get', `/tags?type=${encodeURIComponent(type)}&id=${encodeURIComponent(itemId)}`),
        () => ({ tags }), [`${type}:${itemId}`]);
    outbox = outbox.filter((e) => !(e.kind === 'tags' && e.type === type && e.itemId === itemId));
    outbox.push({ id: newId(), kind: 'tags', type, itemId, tags, title });
    await saveOutbox();
}

// --- Sending ---------------------------------------------------------------

/** A new note got its real id: change every reference to the temporary one. */
async function replaceId(tempId, realId) {
    const from = cardKey(tempId);
    const to = cardKey(realId);
    outbox.forEach((e) => {
        if (e.kind === 'card-update' && e.cardId === tempId) e.cardId = realId;
        if (e.kind === 'tags' && e.type === 'card' && e.itemId === tempId) e.itemId = realId;
        if (e.kind === 'colors') e.items = e.items.map((i) => (i.type === 'card' && i.id === tempId ? { ...i, id: realId } : i));
    });
    updateRegistry((draft) => {
        if (draft.items[from]) { draft.items[to] = { at: Date.now() }; delete draft.items[from]; }
        Object.keys(draft.lists).forEach((name) => {
            draft.lists[name] = draft.lists[name].map((k) => (k === from ? to : k));
        });
    });
    await dbDelete('responses', cardRecord(tempId)).catch(() => {});
    // A screen showing the note by its temporary id moves to the real one
    // (pages/WordbookPage.js).
    window.dispatchEvent(new CustomEvent('offline-id-changed', { detail: { type: 'card', from: tempId, to: realId } }));
}

/** Send one change. Throws axios errors (with `response` if the server answered). */
async function send(entry) {
    if (entry.kind === 'card-create') {
        const res = await api.post('/wordbook/card/create',
            { title: entry.title, content: entry.content, wordbooks: entry.wordbooks }, JSON_HEADERS);
        await replaceId(entry.tempId, res.data.card_id);
    } else if (entry.kind === 'card-update') {
        const current = (await api.post('/wordbook/card/get', { card_id: entry.cardId }, JSON_HEADERS)).data || {};
        const serverTime = current.updated_datetime;
        if (serverTime && serverTime > entry.editedAt) {
            notice(`“${current.title || entry.title}” was changed on another device after your offline edit, so the newer version was kept.`);
            return;
        }
        await api.post('/wordbook/card/update',
            { card_id: entry.cardId, title: entry.title, content: entry.content }, JSON_HEADERS);
        if (serverTime && entry.baseUpdated && serverTime > entry.baseUpdated) {
            notice(`“${entry.title}”: your offline edit replaced an earlier change made on another device.`);
        }
    } else if (entry.kind === 'colors') {
        await api.post('/wordbook/item-colors', { items: entry.items, color: entry.color }, JSON_HEADERS);
    } else if (entry.kind === 'tags') {
        await api.post('/tags', { type: entry.type, id: entry.itemId, tags: entry.tags, title: entry.title }, JSON_HEADERS);
    }
}

const describe = (entry) => (entry.title ? `“${entry.title}”` : 'a change');

/**
 * Send what's waiting, oldest first (see the top of this file). Runs when the
 * connection returns and at start-up (offline/downloads.js).
 */
export async function syncOutbox() {
    if (syncing || !outbox.length || !api || !isOnline()) return;
    syncing = true;
    publishState();
    let sent = 0;
    try {
        while (outbox.length && isOnline()) {
            const entry = outbox[0];
            try {
                await send(entry);
            } catch (err) {
                const status = err.response && err.response.status;
                // No answer, or the server's own trouble: try again later.
                if (!status || status >= 500) break;
                // Refused (e.g. the note was deleted elsewhere): drop it.
                notice(entry.kind === 'card-update'
                    ? `${describe(entry)} couldn’t be saved: it may have been deleted on another device.`
                    : `${describe(entry)} couldn’t be saved.`);
            }
            outbox.shift();
            sent += 1;
            await saveOutbox();
        }
    } finally {
        syncing = false;
        publishState();
        if (sent) afterSync();
    }
}
