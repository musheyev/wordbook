/**
 * Images a user adds to a word themselves, from their device or from a web
 * address. Private: only that user sees them, next to the word's shared
 * images (word-pictures.js), until an admin makes one available to everyone
 * (image-curation.js addSharedImage). Sharing a word or notebook with
 * someone (inbox.js) gives them the sender's images for those words too.
 *
 * Table: dictionary_user_word_images (create-word-image-tables.js)
 *   user_name  (partition key)
 *   word       (sort key)  lower-cased, trimmed, as the dictionary keys words
 *   images     image URLs, oldest first, at most MAX_PER_WORD
 *
 * The files themselves are our own copies in S3 under "word-images/" (a
 * web address is downloaded, see fetch-image.js), served at
 * /api/word-images/<name>. Only URLs of that form are ever stored, so a
 * user's list can't point at anything else.
 */
const db = require("./dynamoDb");
const images = require("./images");
const { fetchImage, FetchImageError } = require("./fetch-image");

const TABLE = "dictionary_user_word_images";
const MAX_PER_WORD = 10;
const URL_RE = /^\/api\/word-images\/[A-Za-z0-9-]+\.(?:png|jpg|gif|webp)$/;

/** An error the router reports with its own HTTP status and message. */
class UserImageError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const normalizeWord = (word) => String(word || "").trim().toLowerCase();
const isWordImageUrl = (url) => typeof url === "string" && URL_RE.test(url);

function requireWord(word) {
    const w = normalizeWord(word);
    if (!w || w.length > 100) throw new UserImageError(400, "Choose a word.");
    return w;
}

/**
 * @param {string} userName
 * @param {string} word
 * @returns {Promise<string[]>}
 */
async function listImages(userName, word) {
    const w = normalizeWord(word);
    if (!w) return [];
    const data = await db.dynamoDbClientInstance().get({
        TableName: TABLE,
        Key: { user_name: userName, word: w },
    }).promise();
    return (data.Item && data.Item.images) || [];
}

async function saveList(userName, word, list) {
    const table = db.dynamoDbClientInstance();
    if (list.length === 0) {
        await table.delete({ TableName: TABLE, Key: { user_name: userName, word } }).promise();
    } else {
        await table.put({
            TableName: TABLE,
            Item: { user_name: userName, word, images: list, updated_at: new Date().toISOString() },
        }).promise();
    }
    return list;
}

/**
 * Add images to the user's list for a word (skipping any already there).
 *
 * @param {string} userName
 * @param {string} word
 * @param {string[]} urls /api/word-images/... URLs; anything else is ignored
 * @param {{strict?: boolean}} options strict: refuse (400) if the list would
 *   go over MAX_PER_WORD, for the user adding one image. Otherwise (images
 *   arriving with a share) extra images are quietly left out.
 * @returns {Promise<string[]>} the list after the change
 */
async function addImages(userName, word, urls, { strict = false } = {}) {
    const w = requireWord(word);
    const current = await listImages(userName, w);
    const fresh = urls.filter((url) => isWordImageUrl(url) && !current.includes(url));
    if (fresh.length === 0) return current;
    if (strict && current.length + fresh.length > MAX_PER_WORD) {
        throw new UserImageError(400, `You can add up to ${MAX_PER_WORD} images to a word. Remove one first.`);
    }
    return saveList(userName, w, [...current, ...fresh].slice(0, MAX_PER_WORD));
}

/**
 * @param {string} userName
 * @param {string} word
 * @param {string} url
 * @returns {Promise<string[]>} the list after the change
 */
async function removeImage(userName, word, url) {
    const w = requireWord(word);
    const current = await listImages(userName, w);
    if (!current.includes(url)) return current;
    return saveList(userName, w, current.filter((u) => u !== url));
}

/**
 * Store an uploaded file as a word image.
 *
 * @param {Buffer} buffer
 * @returns {Promise<string>} its /api/word-images/... URL
 */
async function storeUpload(buffer) {
    const contentType = images.sniffType(buffer);
    if (!contentType) throw new UserImageError(415, "Choose a PNG, JPEG, GIF or WebP image.");
    return store(buffer, contentType);
}

/**
 * Download the image at a web address and store our own copy.
 *
 * @param {string} rawUrl
 * @returns {Promise<string>} its /api/word-images/... URL
 */
async function storeFromLink(rawUrl) {
    try {
        const { buffer, contentType } = await fetchImage(rawUrl);
        return await store(buffer, contentType);
    } catch (err) {
        if (err instanceof FetchImageError) throw new UserImageError(400, err.message);
        throw err;
    }
}

async function store(buffer, contentType) {
    try {
        const name = await images.putImage(buffer, contentType, images.WORD_PREFIX);
        return `/api/word-images/${name}`;
    } catch (err) {
        if (err.code === "NO_BUCKET") throw new UserImageError(503, "Image uploads aren't configured on the server yet.");
        throw err;
    }
}

/**
 * Every image URL in every user's lists, for image cleanup (image-gc.js).
 *
 * @param {(url: string) => void} onUrl
 */
async function forEachStoredUrl(onUrl) {
    let key;
    do {
        const page = await db.dynamoDbClientInstance().scan({ TableName: TABLE, ExclusiveStartKey: key }).promise();
        (page.Items || []).forEach((row) => (row.images || []).forEach(onUrl));
        key = page.LastEvaluatedKey;
    } while (key);
}

module.exports = {
    listImages, addImages, removeImage, storeUpload, storeFromLink, forEachStoredUrl,
    isWordImageUrl, normalizeWord, UserImageError, MAX_PER_WORD, TABLE,
};
