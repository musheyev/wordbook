// Uploaded images: store them in S3 and serve them back. Mirrors the TTS
// audio pattern (tts.js) — lazy S3 client, same bucket, Lambda runtime
// bundles @aws-sdk/client-s3. Two folders (prefixes):
//   images/       images in notes (routes/imagesRouter.js, signed-in only)
//   word-images/  images users add to a word (routes/wordImagesRouter.js,
//                 public, since shared word images show to everyone)
//
// Config (env):
//   UPLOAD_BUCKET (or TTS_BUCKET)  S3 bucket for uploads (set in prod by CDK)
//   AWS_REGION                     region (Lambda sets this automatically)
const crypto = require("crypto");

const BUCKET = process.env.UPLOAD_BUCKET || process.env.TTS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const PREFIX = "images/";
const WORD_PREFIX = "word-images/";

// Content-type -> file extension. Also the allow-list of what can be uploaded.
const EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
};

const isConfigured = () => Boolean(BUCKET);

// The image type from the file's first bytes, or null if it isn't one we
// accept. Used instead of trusting a Content-Type header, which a browser or
// a remote server can get wrong (and SVG, which can carry scripts, is never
// accepted).
function sniffType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    if (buffer[0] === 0x89 && buffer.toString("latin1", 1, 4) === "PNG") return "image/png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.toString("latin1", 0, 4) === "GIF8") return "image/gif";
    if (buffer.toString("latin1", 0, 4) === "RIFF" && buffer.toString("latin1", 8, 12) === "WEBP") return "image/webp";
    return null;
}

let _s3 = null;
function s3() {
    if (!BUCKET) return null;
    if (!_s3) {
        const { S3Client } = require("@aws-sdk/client-s3");
        _s3 = new S3Client({ region: REGION });
    }
    return _s3;
}

// Store an image buffer under `prefix`; returns its filename ("<uuid>.<ext>").
async function putImage(buffer, contentType, prefix = PREFIX) {
    const client = s3();
    if (!client) {
        const e = new Error("Image storage not configured");
        e.code = "NO_BUCKET";
        throw e;
    }
    const ext = EXT[contentType];
    if (!ext) {
        const e = new Error("Unsupported image type");
        e.code = "BAD_TYPE";
        throw e;
    }
    const name = `${crypto.randomUUID()}.${ext}`;
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    await client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: prefix + name,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
    }));
    return name;
}

// Fetch an image by filename from `prefix`, or null if it doesn't exist.
async function getImage(name, prefix = PREFIX) {
    const client = s3();
    if (!client) return null;
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    try {
        const out = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: prefix + name }));
        const parts = [];
        for await (const chunk of out.Body) parts.push(chunk);
        return { buffer: Buffer.concat(parts), contentType: out.ContentType || "application/octet-stream" };
    } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode;
        if (err.name === "NoSuchKey" || err.name === "NotFound" || status === 404) return null;
        throw err;
    }
}

module.exports = { putImage, getImage, isConfigured, sniffType, EXT, PREFIX, WORD_PREFIX };
