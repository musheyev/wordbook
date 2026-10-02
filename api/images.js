// Note images: store uploaded images in S3 and serve them back. Mirrors the
// TTS audio pattern (tts.js) — lazy S3 client, same bucket, Lambda runtime
// bundles @aws-sdk/client-s3. Images live under the "images/" prefix.
//
// Config (env):
//   UPLOAD_BUCKET (or TTS_BUCKET)  S3 bucket for uploads (set in prod by CDK)
//   AWS_REGION                     region (Lambda sets this automatically)
const crypto = require("crypto");

const BUCKET = process.env.UPLOAD_BUCKET || process.env.TTS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const PREFIX = "images/";

// Content-type -> file extension. Also the allow-list of what can be uploaded.
const EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
};

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

// Store an image buffer; returns the public filename (served at /images/<name>).
async function putImage(buffer, contentType) {
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
        Key: PREFIX + name,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
    }));
    return name;
}

// Fetch an image by filename, or null if it doesn't exist.
async function getImage(name) {
    const client = s3();
    if (!client) return null;
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    try {
        const out = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: PREFIX + name }));
        const parts = [];
        for await (const chunk of out.Body) parts.push(chunk);
        return { buffer: Buffer.concat(parts), contentType: out.ContentType || "application/octet-stream" };
    } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode;
        if (err.name === "NoSuchKey" || err.name === "NotFound" || status === 404) return null;
        throw err;
    }
}

module.exports = { putImage, getImage, isConfigured };
