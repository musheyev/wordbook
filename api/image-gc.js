// Note-image housekeeping (admin only). Orphaned images — referenced by no note
// anywhere — are MOVED to an "archive/" prefix rather than deleted, so a
// mistaken sweep can be rolled back. Three actions:
//   archiveOrphans  images/<name> -> archive/<name>   (the reversible "GC")
//   restoreAll      archive/<name> -> images/<name>   (rollback)
//   clearArchive    delete everything under archive/  (the only destructive step)
//
// Why restore is reliable: every image lives at images/<uuid>.<ext>, so its
// archive key is archive/<uuid>.<ext> and restoring it back to images/<uuid>.<ext>
// returns it to the exact spot the note's URL points at — no bookkeeping needed.
//
// "In use" means referenced in ANY of the three places a note's HTML can live:
//   dictionary_cards       (notes)     attr: content
//   dictionary_word_notes  (per word)  attr: content
//   dictionary_inbox       (shares)    attr: content, or notebook.cards[].content
const database = require("./dynamoDb");

const BUCKET = process.env.UPLOAD_BUCKET || process.env.TTS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const LIVE = "images/";
const ARCHIVE = "archive/";
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

// List S3 objects directly under a prefix -> [{ name, lastModified }].
async function listUnder(prefix) {
    const client = s3();
    const { ListObjectsV2Command } = require("@aws-sdk/client-s3");
    const out = [];
    let ContinuationToken;
    do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken }));
        (page.Contents || []).forEach((o) => {
            const name = o.Key.slice(prefix.length);
            if (name) out.push({ name, lastModified: o.LastModified });
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

// Move every orphaned (unreferenced, older than the grace window) live image to
// the archive. Returns counts only.
async function archiveOrphans() {
    needBucket();
    const referenced = await collectReferenced();
    const live = await listUnder(LIVE);
    const cutoff = Date.now() - GRACE_MS;
    const orphans = live.filter(
        (o) => !referenced.has(o.name) && o.lastModified && o.lastModified.getTime() < cutoff
    );
    for (const o of orphans) {
        await moveObject(LIVE + o.name, ARCHIVE + o.name);
    }
    return { scanned: live.length, inUse: referenced.size, archived: orphans.length };
}

// Move everything in the archive back to live (rollback the last sweep).
async function restoreAll() {
    needBucket();
    const archived = await listUnder(ARCHIVE);
    for (const o of archived) {
        await moveObject(ARCHIVE + o.name, LIVE + o.name);
    }
    return { restored: archived.length };
}

// Permanently delete everything in the archive.
async function clearArchive() {
    needBucket();
    const client = s3();
    const { DeleteObjectsCommand } = require("@aws-sdk/client-s3");
    const archived = await listUnder(ARCHIVE);
    let deleted = 0;
    for (let i = 0; i < archived.length; i += 1000) {
        const batch = archived.slice(i, i + 1000).map((o) => ({ Key: ARCHIVE + o.name }));
        if (batch.length) {
            await client.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: batch } }));
            deleted += batch.length;
        }
    }
    return { deleted };
}

// How many images are currently in the archive (for the admin page).
async function archiveCount() {
    if (!isConfigured()) return { configured: false, count: 0 };
    const archived = await listUnder(ARCHIVE);
    return { configured: true, count: archived.length };
}

module.exports = { archiveOrphans, restoreAll, clearArchive, archiveCount, isConfigured };
