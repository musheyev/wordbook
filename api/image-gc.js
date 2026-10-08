// Uploaded-image housekeeping (admin only). Orphaned images — referenced
// nowhere — are MOVED to an "archive/" prefix rather than deleted, so a
// mistaken sweep can be rolled back. Three actions:
//   archiveOrphans  live -> archive   (the reversible "GC")
//   restoreAll      archive -> live   (rollback)
//   clearArchive    delete everything under archive/  (the only destructive step)
//
// Two kinds of image, each with its own live and archive folder:
//   note images  images/<name>       <-> archive/<name>
//   word images  word-images/<name>  <-> archive/word-images/<name>
// Every file keeps its name, so restoring returns it to the exact key its
// URL points at — no bookkeeping needed.
//
// "In use" for a note image: referenced in any note HTML —
//   dictionary_cards       (notes)     attr: content
//   dictionary_word_notes  (per word)  attr: content
//   dictionary_inbox       (shares)    attr: content, or notebook.cards[].content
// "In use" for a word image: in any list of word images —
//   dictionary_images            (shared)    attr: images
//   dictionary_user_word_images  (personal)  attr: images
//   dictionary_inbox             (shares)    attr: images, or notebook.wordImages
const database = require("./dynamoDb");

const BUCKET = process.env.UPLOAD_BUCKET || process.env.TTS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const LIVE = "images/";
const ARCHIVE = "archive/";
const WORD_LIVE = "word-images/";
const WORD_ARCHIVE = "archive/word-images/";
const GRACE_MS = 24 * 60 * 60 * 1000; // never touch images younger than 24h

const isConfigured = () => Boolean(BUCKET);

let _s3 = null;
function s3() {
    if (!BUCKET) return null;
    if (!_s3) {
        const { S3Client } = require("@aws-sdk/client-s3");
        _s3 = new S3Client({ region: REGION });
    }
    return _s3;
}

// Image filenames referenced in a chunk of note HTML (/api/images/<name> or /images/<name>).
const IMG_RE = /\/(?:api\/)?images\/([A-Za-z0-9-]+\.(?:png|jpg|gif|webp))/g;
function namesInHtml(html, into) {
    if (!html) return;
    IMG_RE.lastIndex = 0;
    let m;
    while ((m = IMG_RE.exec(html)) !== null) into.add(m[1]);
}

// Read a whole DynamoDB table, page by page, calling onItem for each row.
async function scanAll(TableName, onItem) {
    const db = database.dynamoDbClientInstance();
    let ExclusiveStartKey;
    do {
        const data = await db.scan({ TableName, ExclusiveStartKey }).promise();
        (data.Items || []).forEach(onItem);
        ExclusiveStartKey = data.LastEvaluatedKey;
    } while (ExclusiveStartKey);
}

// Word image filenames in a list of URLs (/api/word-images/<name>).
const WORD_IMG_RE = /^\/api\/word-images\/([A-Za-z0-9-]+\.(?:png|jpg|gif|webp))$/;
function namesInUrls(urls, into) {
    (Array.isArray(urls) ? urls : []).forEach((url) => {
        const m = WORD_IMG_RE.exec(url);
        if (m) into.add(m[1]);
    });
}

// The set of word image filenames in any shared, personal or shared-with
// list.
async function collectReferencedWordImages() {
    const names = new Set();
    await scanAll("dictionary_images", (it) => namesInUrls(it.images, names));
    await scanAll("dictionary_user_word_images", (it) => namesInUrls(it.images, names));
    await scanAll("dictionary_inbox", (it) => {
        namesInUrls(it.images, names);
        const wordImages = it.notebook && it.notebook.wordImages;
        if (wordImages) Object.values(wordImages).forEach((urls) => namesInUrls(urls, names));
    });
    return names;
}

// The set of image filenames referenced by any note anywhere.
async function collectReferenced() {
    const names = new Set();
    await scanAll("dictionary_cards", (it) => namesInHtml(it.content, names));
    await scanAll("dictionary_word_notes", (it) => namesInHtml(it.content, names));
    await scanAll("dictionary_inbox", (it) => {
        namesInHtml(it.content, names);
        if (it.notebook && Array.isArray(it.notebook.cards)) {
            it.notebook.cards.forEach((c) => namesInHtml(c && c.content, names));
        }
    });
    return names;
}

// List S3 objects under a prefix -> [{ name, lastModified }]. With `flat`,
// only objects directly under it (archive/<name>, not archive/word-images/…).
async function listUnder(prefix, { flat = false } = {}) {
    const client = s3();
    const { ListObjectsV2Command } = require("@aws-sdk/client-s3");
    const out = [];
    let ContinuationToken;
    do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken }));
        (page.Contents || []).forEach((o) => {
            const name = o.Key.slice(prefix.length);
            if (name && !(flat && name.includes("/"))) out.push({ name, lastModified: o.LastModified, size: o.Size });
        });
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
}

// S3 has no move; copy then delete.
async function moveObject(fromKey, toKey) {
    const client = s3();
    const { CopyObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
    await client.send(new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${fromKey}`,
        Key: toKey,
        MetadataDirective: "COPY",
    }));
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: fromKey }));
}

function needBucket() {
    if (!isConfigured()) {
        const e = new Error("Image storage not configured");
        e.code = "NO_BUCKET";
        throw e;
    }
}

// Move one kind's orphans (not in `referenced`, older than the grace
// window) from `live` to `archive`.
async function archiveKind(live, archive, referenced) {
    const files = await listUnder(live, { flat: true });
    const cutoff = Date.now() - GRACE_MS;
    const orphans = files.filter(
        (o) => !referenced.has(o.name) && o.lastModified && o.lastModified.getTime() < cutoff
    );
    for (const o of orphans) {
        await moveObject(live + o.name, archive + o.name);
    }
    return { scanned: files.length, inUse: referenced.size, archived: orphans.length };
}

// Move every orphaned note and word image to the archive. Returns counts
// only: the totals, and each kind's in `notes` / `words`.
async function archiveOrphans() {
    needBucket();
    const notes = await archiveKind(LIVE, ARCHIVE, await collectReferenced());
    const words = await archiveKind(WORD_LIVE, WORD_ARCHIVE, await collectReferencedWordImages());
    return {
        scanned: notes.scanned + words.scanned,
        inUse: notes.inUse + words.inUse,
        archived: notes.archived + words.archived,
        notes,
        words,
    };
}

// Move everything in the archive back to live (rollback the last sweep).
async function restoreAll() {
    needBucket();
    const notes = await listUnder(ARCHIVE, { flat: true });
    for (const o of notes) {
        await moveObject(ARCHIVE + o.name, LIVE + o.name);
    }
    const words = await listUnder(WORD_ARCHIVE, { flat: true });
    for (const o of words) {
        await moveObject(WORD_ARCHIVE + o.name, WORD_LIVE + o.name);
    }
    return { restored: notes.length + words.length };
}

// Every archived image: note images (archive/<name>) and word images
// (archive/word-images/<name>), as full keys. Archived audio (archive/tts/,
// tts-gc.js) isn't included.
async function archivedImageKeys() {
    const notes = (await listUnder(ARCHIVE, { flat: true })).map((o) => ARCHIVE + o.name);
    const words = (await listUnder(WORD_ARCHIVE, { flat: true })).map((o) => WORD_ARCHIVE + o.name);
    return [...notes, ...words];
}

// Permanently delete keys, 1000 per request (S3's limit).
async function deleteKeys(keys) {
    const client = s3();
    const { DeleteObjectsCommand } = require("@aws-sdk/client-s3");
    let deleted = 0;
    for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
        if (batch.length) {
            await client.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: batch } }));
            deleted += batch.length;
        }
    }
    return deleted;
}

// Permanently delete every archived image.
async function clearArchive() {
    needBucket();
    return { deleted: await deleteKeys(await archivedImageKeys()) };
}

// How many images are currently in the archive (for the admin page).
async function archiveCount() {
    if (!isConfigured()) return { configured: false, count: 0 };
    return { configured: true, count: (await archivedImageKeys()).length };
}

module.exports = {
    archiveOrphans, restoreAll, clearArchive, archiveCount, isConfigured,
    // shared with tts-gc.js
    listUnder, moveObject, deleteKeys, needBucket, BUCKET,
};
