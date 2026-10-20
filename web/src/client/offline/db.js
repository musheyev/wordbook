// The device's offline storage: a small wrapper around IndexedDB.
//
// IndexedDB is the browser's built-in database. Unlike localStorage (a few
// megabytes of strings), it holds large binary data — audio and images — and
// its calls don't freeze the page while they work. Its own API is old and
// event-based (request.onsuccess = …), so this file wraps the few operations
// we need in Promises, so the rest of the code can simply `await` them.
//
// One database, "remembrancer-offline", with four "object stores" (tables):
//   responses  saved API answers, keyed by the request (offline/apiCache.js)
//   audio      read-aloud audio, keyed by voice + language + text (offline/audio.js)
//   images     note images, keyed by their address (offline/images.js)
//   meta       small records, e.g. what's downloaded (offline/downloads.js)
// Every value is an object; records that belong to downloaded notes carry
// `items` (item keys like "card:<id>"), so removing a download can find them.
const DB_NAME = 'remembrancer-offline';
const DB_VERSION = 1;
export const STORES = ['responses', 'audio', 'images', 'meta'];

let opening = null;

/**
 * Open the database (once; later calls share it). The first time on a
 * device, `onupgradeneeded` creates the stores. Bumping DB_VERSION would run
 * it again, which is how a later version could add a store.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
    if (!opening) {
        opening = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                STORES.forEach((name) => {
                    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
                });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => { opening = null; reject(req.error); };
        });
    }
    return opening;
}

/**
 * Run one request inside a transaction and resolve with its result.
 * A transaction is IndexedDB's unit of work: everything in it is saved
 * together, or not at all.
 *
 * @param {string} store one of STORES
 * @param {'readonly'|'readwrite'} mode
 * @param {(s: IDBObjectStore) => IDBRequest} makeRequest
 */
async function run(store, mode, makeRequest) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = makeRequest(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

/** The value saved under `key`, or undefined. */
export const dbGet = (store, key) => run(store, 'readonly', (s) => s.get(key));

/** Save `value` under `key` (replacing what was there). */
export const dbPut = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key));

/** Remove the value under `key`. */
export const dbDelete = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

/** Every key in a store. */
export const dbKeys = (store) => run(store, 'readonly', (s) => s.getAllKeys());

/** Empty a store. */
export const dbClear = (store) => run(store, 'readwrite', (s) => s.clear());

/**
 * Visit every record in a store with a cursor (IndexedDB's way of walking a
 * table one row at a time) and delete those `shouldDelete(value, key)` picks.
 * Used to drop what no download needs any more.
 *
 * @returns {Promise<number>} how many were deleted
 */
export async function dbDeleteWhere(store, shouldDelete) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        let deleted = 0;
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            if (shouldDelete(cursor.value, cursor.key)) { cursor.delete(); deleted += 1; }
            cursor.continue();
        };
        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => reject(tx.error);
    });
}
