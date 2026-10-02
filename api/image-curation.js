/**
 * Image curation (admins only): delete images, fetch new ones, and review
 * every image in the system to clean up inappropriate ones.
 *
 * Images are shared: one `dictionary_images` row per word, seen by every
 * user (see word-pictures.js). So every change here affects everyone, which
 * is why the routes that call these functions require an admin.
 *
 * Deleted images are remembered
 * -----------------------------
 * Deleting a URL moves it from the row's `images` list to its `removed`
 * list. Fetching new images skips anything in `removed`, so an inappropriate
 * image can't come back from a later image search. "Undo" (restoreImage)
 * moves it back.
 *
 * Safe concurrent edits: optimistic locking
 * -----------------------------------------
 * Every change is read–modify–write: read the row, change the lists in
 * JavaScript, write them back. If two admins did that to the same word at
 * the same moment, the second write would silently erase the first.
 *
 * To prevent that, each row carries a `version` number. A write says "save
 * this *only if* version is still what I read" (a ConditionExpression) and
 * bumps it by one. If someone else wrote in between, the version no longer
 * matches, DynamoDB refuses the write, and we re-read and try again. This is
 * called optimistic locking: no lock is held while working; conflicts are
 * detected at write time instead.
 */
const db = require("./dynamoDb");
const wp = require("./word-pictures");

/** Words per admin listing page. At most 5 images each, so up to ~100 images. */
const WORDS_PER_PAGE = 20;
/** Attempts before giving up when other admins keep changing the same word. */
const MAX_WRITE_ATTEMPTS = 3;

/** An error the router reports with its own HTTP status and message. */
class CurationError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Apply a change to one word's images, with optimistic locking and retries.
 *
 * `change` receives the current { images, removed } lists and returns the new
 * ones (it may be async, e.g. to call Brave). It runs again if the row
 * changed underneath us, so it must only compute the new lists — never write
 * anything itself. (A retried refresh calls Brave again; that costs quota
 * but is otherwise harmless.)
 *
 * @param {string} word
 * @param {(current: {images: string[], removed: string[]}) => Promise<{images: string[], removed: string[]}>|{images: string[], removed: string[]}} change
 * @param {{createIfMissing?: boolean}} options createIfMissing: a word with
 *   no saved row starts from empty lists (refresh), instead of a 404
 * @returns {Promise<{images: string[], removed: string[]}>} the saved lists
 */
async function updateWordImages(word, change, { createIfMissing = false } = {}) {
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
        let row = await wp.getImageRow(word);
        if (!row) {
            if (!createIfMissing) {
                throw new CurationError(404, `No images are stored for "${word}".`);
            }
            // No version yet, so the write below creates the row; if another
            // admin creates it first, the condition fails and we retry.
            row = {};
        }
        const version = row.version || 0;
        const next = await change({ images: row.images || [], removed: row.removed || [] });

        try {
            await db.dynamoDbClientInstance().update({
                TableName: wp.TABLE,
                Key: { word },
                UpdateExpression: "SET images = :images, removed = :removed, version = :next",
                // Rows written before curation existed have no version yet.
                ConditionExpression: "attribute_not_exists(version) OR version = :version",
                ExpressionAttributeValues: {
                    ":images": next.images,
                    ":removed": next.removed,
                    ":version": version,
                    ":next": version + 1,
                },
            }).promise();
            return next;
        } catch (err) {
            if (err.name !== "ConditionalCheckFailedException") throw err;
            // Someone else changed this word since we read it: loop and retry
            // on top of their change.
        }
    }
    throw new CurationError(409, "These images were being changed by someone else. Reload and try again.");
}

/** `list` plus `items` not already in it, keeping order. */
const addUnique = (list, items) => [...list, ...items.filter((item) => !list.includes(item))];

/**
 * Delete one image from a word (word page ×, or the admin grid).
 *
 * @param {string} word
 * @param {string} url
 * @returns {Promise<string[]>} the word's images after the change
 */
async function deleteImage(word, url) {
    const saved = await updateWordImages(word, ({ images, removed }) => ({
        images: images.filter((image) => image !== url),
        removed: addUnique(removed, [url]),
    }));
    return saved.images;
}

/**
 * Undo a delete: put the URL back (at the end of the list) and take it out
 * of `removed`. Does nothing if the word already shows MAX_IMAGES.
 *
 * @param {string} word
 * @param {string} url
 * @returns {Promise<string[]>} the word's images after the change
 */
async function restoreImage(word, url) {
    const saved = await updateWordImages(word, ({ images, removed }) => ({
        images: images.includes(url) || images.length >= wp.MAX_IMAGES ? images : [...images, url],
        removed: removed.filter((image) => image !== url),
    }));
    return saved.images;
}

/**
 * Up to `count` image URLs from one image search that aren't in `exclude`.
 *
 * @param {string} word
 * @param {number} count
 * @param {string[]} exclude URLs already shown or removed
 * @returns {Promise<string[]>}
 */
async function findNewImages(word, count, exclude) {
    const results = await wp.fetchImages(word);
    return results.filter((url) => !exclude.includes(url)).slice(0, count);
}

/**
 * Fetch new images for a word (word page "Refresh images").
 *
 *   { count }            add `count` new images, 1 to (MAX_IMAGES − shown)
 *   { replaceAll: true } move all current images to `removed` and fetch a
 *                        full new set
 *
 * @param {string} word
 * @param {{count?: number, replaceAll?: boolean}} options
 * @returns {Promise<{images: string[], added: number, requested: number}>}
 *   `added` can be less than `requested` when the search runs out of new images
 */
async function refreshImages(word, { count, replaceAll = false }) {
    let requested = 0;
    let added = 0;

    const saved = await updateWordImages(word, async ({ images, removed }) => {
        const keep = replaceAll ? [] : images;
        const room = wp.MAX_IMAGES - keep.length;
        requested = replaceAll ? wp.MAX_IMAGES : Number(count);
        if (!Number.isInteger(requested) || requested < 1 || requested > room) {
            throw new CurationError(400, room === 0
                ? "All image slots are in use. Delete some first, or replace all."
                : `Choose between 1 and ${room} new images.`);
        }

        const fresh = await findNewImages(word, requested, [...images, ...removed]);
        added = fresh.length;
        return {
            images: [...keep, ...fresh],
            removed: replaceAll ? addUnique(removed, images) : removed,
        };
    }, { createIfMissing: true });

    return { images: saved.images, added, requested };
}

/**
 * One page of every image in the system, for the admin Images page.
 *
 * Uses a Scan (reads the table page by page). Scans read every row, so they
 * don't suit big tables; this one is small (a few hundred words) and only
 * admins use it. `Limit` caps the rows *read* per call; LastEvaluatedKey
 * says where to continue, and becomes the `cursor` for the next page.
 *
 * Each image comes with its word, which the page needs to delete it but
 * doesn't display.
 *
 * @param {string|undefined} cursor from the previous page
 * @returns {Promise<{images: Array<{word: string, url: string}>, cursor: string|null, total?: number}>}
 *   `total` (all images in the system) only on the first page
 */
async function listAllImages(cursor) {
    const page = await db.dynamoDbClientInstance().scan({
        TableName: wp.TABLE,
        ProjectionExpression: "word, images",
        Limit: WORDS_PER_PAGE,
        ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, "base64url").toString()) : undefined,
    }).promise();

    const images = (page.Items || []).flatMap((row) =>
        (row.images || []).map((url) => ({ word: row.word, url })));
    // The cursor is DynamoDB's LastEvaluatedKey, encoded so it travels safely
    // in a URL query string.
    const next = page.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(page.LastEvaluatedKey)).toString("base64url")
        : null;

    const result = { images, cursor: next };
    if (!cursor) {
        result.total = await countAllImages();
    }
    return result;
}

/** Total images across all words (a full scan of just the image lists). */
async function countAllImages() {
    let total = 0;
    let lastKey;
    do {
        const page = await db.dynamoDbClientInstance().scan({
            TableName: wp.TABLE,
            ProjectionExpression: "images",
            ExclusiveStartKey: lastKey,
        }).promise();
        for (const row of page.Items || []) total += (row.images || []).length;
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);
    return total;
}

/**
 * Delete several images at once (admin grid "Delete N selected"). Images of
 * the same word are removed in one write.
 *
 * @param {Array<{word: string, url: string}>} items
 * @returns {Promise<{deleted: number}>}
 */
async function deleteImages(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new CurationError(400, "Select images to delete.");
    }
    const byWord = new Map();
    for (const { word, url } of items) {
        if (typeof word !== "string" || typeof url !== "string") continue;
        if (!byWord.has(word)) byWord.set(word, []);
        byWord.get(word).push(url);
    }

    let deleted = 0;
    for (const [word, urls] of byWord) {
        await updateWordImages(word, ({ images, removed }) => ({
            images: images.filter((image) => !urls.includes(image)),
            removed: addUnique(removed, urls),
        }));
        deleted += urls.length;
    }
    return { deleted };
}

module.exports = {
    CurationError,
    deleteImage,
    restoreImage,
    refreshImages,
    listAllImages,
    deleteImages,
};
