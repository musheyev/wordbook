/**
 * Word images: the pictures shown under a word's definitions.
 *
 * Images come from Brave Search's image search API and are cached per word
 * in the `dictionary_images` table, shared by all users. (They came from
 * Google's Custom Search API until Google closed it to new customers.)
 *
 *   word     (partition key)  the lower-cased word
 *   images   list of image URLs shown for it, at most MAX_IMAGES
 *   removed  URLs an admin deleted or replaced; never shown again, and
 *            skipped when fetching new images (see image-curation.js)
 *   version  counter bumped on every admin change, for safe concurrent
 *            edits (image-curation.js explains)
 *
 * The first lookup of a new word calls Brave and saves the result; every
 * later lookup reads the cache and costs nothing. A word looked up before
 * that has no saved images (e.g. its search failed back then) is never
 * searched automatically; an admin uses "Refresh images" on its page.
 *
 * All calls to Brave go through fetchImages, so switching to another image
 * provider later means changing that one function.
 */
const axios = require('axios');
const db = require('./dynamoDb');

const BRAVE_SEARCH_KEY = process.env.BRAVE_SEARCH_KEY;

const TABLE = "dictionary_images";
/** Most images shown for a word. */
const MAX_IMAGES = 5;
/** Search results looked through per search. One billed request whatever the number. */
const SEARCH_RESULTS = 40;

/**
 * Stock photo sites whose images carry watermarks. Matched against the page
 * the image came from (e.g. gettyimages.com, gettyimages.co.nz).
 */
const WATERMARKED_SITES = /(^|\.)(gettyimages|istockphoto|dreamstime|shutterstock|alamy|123rf|depositphotos|vectorstock|canstockphoto)\.|(^|\.)stock\.adobe\.com$/;

/**
 * Candidate images for a word, best match first.
 *
 * A bare word mostly finds memes (e.g. "diabolical" returned one Reddit
 * thread 25 times), so we search for "<word> illustration", skip watermarked
 * stock photo sites, and keep at most one image per site so the pictures
 * aren't all from the same place. That usually leaves fewer than
 * SEARCH_RESULTS images, sometimes fewer than MAX_IMAGES, which is fine.
 *
 * @param {string} word
 * @returns {Promise<string[]>} full-size image URLs
 */
async function fetchImages(word) {
    const response = await axios.get("https://api.search.brave.com/res/v1/images/search", {
        params: { q: word + " illustration", count: SEARCH_RESULTS, safesearch: "strict" },
        headers: { "Accept": "application/json", "X-Subscription-Token": BRAVE_SEARCH_KEY },
    });

    const sites = new Set();
    const images = [];
    for (const result of response.data.results || []) {
        const image = result.properties && result.properties.url;
        let site;
        try {
            site = new URL(result.url).hostname.replace(/^www\./, "");
        } catch {
            continue;
        }
        if (!image || WATERMARKED_SITES.test(site) || sites.has(site)) continue;
        sites.add(site);
        images.push(image);
    }
    return images;
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
 * Images to show for a word: from the cache, or — for a new word, the first
 * time anyone looks it up — from Brave, saved to the cache.
 *
 * Never rejects: an image problem shouldn't break a dictionary lookup, so any
 * failure resolves to an empty list (the lookup route shows definitions
 * without images).
 *
 * @param {string} word
 * @param {boolean} isNewWord true only on a word's first lookup ever; other
 *   words without saved images show none rather than search
 * @returns {Promise<string[]>}
 */
async function getWordPictures(word, isNewWord = false) {
    try {
        const row = await getImageRow(word);
        if (row) {
            return row.images || [];
        }
        if (!isNewWord) {
            return [];
        }

        const images = (await fetchImages(word)).slice(0, MAX_IMAGES);
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
    fetchImages,
    MAX_IMAGES,
    TABLE,
};
