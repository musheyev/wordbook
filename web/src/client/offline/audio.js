import { apiFetch } from '../native/auth';
import { chunkRequest } from '../utils/tts';
import { dbGet, dbPut } from './db';
import { isOnline, offlineEnabled } from './network';
import { isCovered } from './registry';

// Read-aloud audio kept on the phone, so downloaded notes can be listened to
// offline (offline/downloads.js saves it; utils/ttsPlayer.js plays it).
//
// Each piece of audio is one chunk — a sentence or a run of one language —
// as an MP3 from POST /api/tts. It's saved under its request (text, language
// and voice; utils/tts.js chunkRequest), so the same sentence read in the same
// voice is saved once, even if several notes contain it. `items` lists the
// downloaded notes/words it belongs to, so removing a download can find it.
// A different voice is a different request: after changing voices, a
// download refreshes with the new one the next time the app is online.

/** The saved-audio key for a chunk. */
export const audioKey = (chunk) => JSON.stringify(chunkRequest(chunk));

/**
 * The note or word a chunk belongs to, as a download key. Play all reads a
 * word as "wordtitle:<word>"; its download is "word:<word>".
 */
const ownerOf = (chunk) => (chunk.item && chunk.item.startsWith('wordtitle:')
    ? `word:${chunk.item.slice('wordtitle:'.length)}` : chunk.item);

/** Save audio for a chunk, adding `owner` to the items it belongs to. */
async function save(key, blob, owner) {
    const existing = await dbGet('audio', key).catch(() => null);
    const items = new Set((existing && existing.items) || []);
    if (owner) items.add(owner);
    await dbPut('audio', key, { blob: blob || existing.blob, items: [...items], savedAt: Date.now() });
}

/**
 * The audio for a chunk, for playing: the copy saved on the phone if there is
 * one, else from the server. Audio fetched for a downloaded note is saved as
 * it plays (e.g. after the note was edited), so it's there next time offline.
 *
 * @param {object} chunk a read-aloud chunk (not a pause)
 * @returns {Promise<Blob>}
 * @throws an Error with `status` when the server refuses, or `isOffline`
 *   when there's no connection and nothing saved
 */
export async function chunkAudio(chunk) {
    const key = audioKey(chunk);
    if (offlineEnabled()) {
        const saved = await dbGet('audio', key).catch(() => null);
        if (saved && saved.blob) return saved.blob;
        if (!isOnline()) {
            const err = new Error("You're offline, and this wasn't downloaded.");
            err.isOffline = true;
            throw err;
        }
    }
    const res = await apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: key,
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => '');
        const err = new Error(msg || 'TTS request failed');
        err.status = res.status;
        throw err;
    }
    const blob = await res.blob();
    const owner = ownerOf(chunk);
    if (offlineEnabled() && isCovered(owner)) save(key, blob, owner).catch(() => {});
    return blob;
}

/**
 * Download the audio for an item's chunks (offline/downloads.js). Audio
 * already saved is only marked as also belonging to this item. A few
 * requests run at a time, which is quicker than one by one without
 * swamping a slow connection.
 *
 * @param {object[]} chunks the item's chunks, exactly as they'd be read
 * @param {string} owner the item's download key, e.g. "card:<id>"
 */
export async function saveChunksAudio(chunks, owner) {
    const todo = chunks.filter((c) => !c.pause && c.text && c.text.trim());
    const queue = [...todo];
    const worker = async () => {
        while (queue.length) {
            const chunk = queue.shift();
            const key = audioKey(chunk);
            const existing = await dbGet('audio', key).catch(() => null);
            if (existing && existing.blob) {
                if (!(existing.items || []).includes(owner)) await save(key, null, owner);
                continue;
            }
            const res = await apiFetch('/api/tts', {
                method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: key,
            });
            if (!res.ok) throw new Error(`Audio failed (${res.status})`);
            await save(key, await res.blob(), owner);
        }
    };
    await Promise.all([worker(), worker(), worker()]);
}
