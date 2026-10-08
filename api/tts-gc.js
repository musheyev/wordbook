// Read-aloud audio housekeeping (admin only), like image-gc.js for images.
// Audio an item stopped using (tts-refs.js "released") and that no item uses
// now is MOVED to "archive/tts/" rather than deleted, so a mistaken sweep can
// be rolled back. Three actions:
//   archiveUnused  tts/<name> -> archive/tts/<name>   (reversible)
//   restoreAll     archive/tts/<name> -> tts/<name>   (rollback)
//   clearArchive   delete everything under archive/tts/  (permanent)
//
// Audio is only a cache: a file archived by mistake is simply generated again
// the next time that text is read aloud. Audio no item ever listed (made
// before tracking existed) is never released, so it's never touched here.
const refs = require("./tts-refs");
const { listUnder, moveObject, deleteKeys, needBucket, BUCKET } = require("./image-gc");

const LIVE = "tts/";
const ARCHIVE = "archive/tts/";

const isConfigured = () => Boolean(BUCKET);

// Released keys no item uses now: [{ audio_key, released_at }].
async function unusedReleased() {
    const [released, referenced] = await Promise.all([refs.releasedKeys(), refs.referencedKeys()]);
    return { released, referenced, unused: released.filter((r) => !referenced.has(r.audio_key)) };
}

/**
 * For the admin page: what a sweep would archive now, and what's archived.
 *
 * @returns {Promise<{configured: boolean, unused: number, unusedBytes: number, archived: number, tracked: number}>}
 */
async function status() {
    if (!isConfigured()) return { configured: false, unused: 0, unusedBytes: 0, archived: 0, tracked: 0 };
    const { unused, referenced } = await unusedReleased();
    const live = await listUnder(LIVE, { flat: true });
    const sizes = new Map(live.map((o) => [LIVE + o.name, o.size || 0]));
    const present = unused.filter((r) => sizes.has(r.audio_key));
    const archived = await listUnder(ARCHIVE, { flat: true });
    return {
        configured: true,
        unused: present.length,
        unusedBytes: present.reduce((sum, r) => sum + sizes.get(r.audio_key), 0),
        archived: archived.length,
        tracked: referenced.size,
    };
}

// Move unused audio to the archive. Released keys whose file is gone or that
// are in use again are forgotten too, so the list doesn't grow forever.
async function archiveUnused() {
    needBucket();
    const { released, referenced, unused } = await unusedReleased();
    const live = new Set((await listUnder(LIVE, { flat: true })).map((o) => LIVE + o.name));
    let archived = 0;
    for (const r of unused) {
        if (!live.has(r.audio_key)) continue;
        await moveObject(r.audio_key, ARCHIVE + r.audio_key.slice(LIVE.length));
        archived++;
    }
    // Every released key is now settled: archived, already gone, or in use
    // again (it's released afresh if an item drops it later).
    const forget = released.map((r) => r.audio_key);
    await refs.forgetReleased(forget);
    return { archived, inUse: referenced.size };
}

async function restoreAll() {
    needBucket();
    const archived = await listUnder(ARCHIVE, { flat: true });
    for (const o of archived) {
        await moveObject(ARCHIVE + o.name, LIVE + o.name);
    }
    return { restored: archived.length };
}

async function clearArchive() {
    needBucket();
    const archived = await listUnder(ARCHIVE, { flat: true });
    return { deleted: await deleteKeys(archived.map((o) => ARCHIVE + o.name)) };
}

module.exports = { status, archiveUnused, restoreAll, clearArchive, isConfigured };
