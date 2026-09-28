/**
 * Word images: the pictures shown under a word's definitions.
 *
 * Images come from Google's Custom Search API (image search) and are cached
 * per word in the `dictionary_images` table, shared by all users:
 *
 *   word     (partition key)  the lower-cased word
 *   images   list of image URLs shown for it, at most MAX_IMAGES
 *   removed  URLs an admin deleted or replaced; never shown again, and
 *            skipped when fetching new images (see image-curation.js)
 *   version  counter bumped on every admin change, for safe concurrent
 *            edits (image-curation.js explains)
 *
 * The first lookup of a word calls Google and saves the result; every later
 * lookup reads the cache and costs nothing.
 *
 * All calls to Google go through fetchGoogleImages, so switching to another
 * image provider later means changing that one function.
 */
const axios = require('axios');
const db = require('./dynamoDb');

const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

const TABLE = "dictionary_images";
/** Most images shown for a word. */
const MAX_IMAGES = 5;

/**
 * One page of Google image search results.
 *
 * @param {string} word
 * @param {number} start 1-based index of the first result (1, 11, 21, …)
 * @param {number} num how many results, 1 to 10 (Google's maximum per call)
 * @returns {Promise<string[]>} image URLs, possibly fewer than `num`
 */
async function fetchGoogleImages(word, start = 1, num = MAX_IMAGES) {
    const url = "https://www.googleapis.com/customsearch/v1?" +
        "key=" + GOOGLE_SEARCH_KEY + "&cx=" + GOOGLE_SEARCH_CX +
        "&num=" + num + "&start=" + start +
        "&searchType=image&q=" + encodeURIComponent(word);

    const response = await axios.get(url);
    return (response.data.items || []).map((item) => item.link);
}

/**
 * The cached row for a word, or null if the word was never looked up.
 *
 * @param {string} word
 * @returns {Promise<{word: string, images: string[], removed?: string[], version?: number}|null>}
 */
async function getImageRow(word) {
    const data = await db.dynamoDbClientInstance().get({ TableName: TABLE, Key: { word } }).promise();
    return data.Item || null;
}

/**
 * Images to show for a word: from the cache, or — the first time a word is
 * looked up — from Google, saved to the cache.
 *
 * Never rejects: an image problem shouldn't break a dictionary lookup, so any
 * failure resolves to an empty list (the lookup route shows definitions
 * without images).
 *
 * @param {string} word
 * @returns {Promise<string[]>}
 */
async function getWordPictures(word) {
    try {
        const row = await getImageRow(word);
        if (row) {
            return row.images || [];
        }

        const images = await fetchGoogleImages(word, 1, MAX_IMAGES);
        // attribute_not_exists: if a parallel lookup cached this word a moment
        // ago, keep that one rather than overwrite it.
        await db.dynamoDbClientInstance().put({
            TableName: TABLE,
            ConditionExpression: "attribute_not_exists(word)",
            Item: { word, images },
        }).promise().catch(() => {});
        return images;
    } catch (err) {
        console.log(`Images for "${word}" unavailable: ${err.message}`);
        return [];
    }
}

module.exports = {
    getWordPictures,
    getImageRow,
    fetchGoogleImages,
    MAX_IMAGES,
    TABLE,
};
