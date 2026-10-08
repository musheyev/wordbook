// Text-to-speech: synthesize a chunk of text with Google Cloud TTS (Chirp 3 HD
// and friends) and cache the MP3 in S3 so the same text+voice is never paid for
// twice. Falls back to no-cache when TTS_BUCKET isn't set (e.g. local dev).
//
// Config (env):
//   GOOGLE_TTS_KEY  Google Cloud API key with Text-to-Speech enabled (required)
//   TTS_BUCKET      S3 bucket for cached audio (optional; set in prod by CDK)
//   AWS_REGION      region for S3 (Lambda sets this automatically)
const crypto = require("crypto");
const axios = require("axios");

const KEY = process.env.GOOGLE_TTS_KEY;
const BUCKET = process.env.TTS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";

// A single request is one sentence/segment, so this is a generous safety cap
// against a runaway request, not a per-note limit.
const MAX_CHARS = 4000;

const isConfigured = () => Boolean(KEY);

// Lazy S3 client — only loaded/created when a bucket is configured. The Node
// Lambda runtime bundles @aws-sdk/client-s3, so it isn't a package dependency.
let _s3 = null;
function s3() {
    if (!BUCKET) return null;
    if (!_s3) {
        const { S3Client } = require("@aws-sdk/client-s3");
        _s3 = new S3Client({ region: REGION });
    }
    return _s3;
}

/**
 * Where a piece of audio is stored: "tts/<hash>.mp3", the hash of voice +
 * language + text. The same sentence in the same voice is one file, however
 * many notes use it. tts-refs.js uses this to know which files an item uses.
 *
 * @param {{text: string, languageCode: string, voiceName?: string}} chunk
 * @returns {string}
 */
function audioKey({ text, languageCode, voiceName }) {
    const clean = String(text || "").slice(0, MAX_CHARS);
    return "tts/" + crypto.createHash("sha256")
        .update(`${voiceName || "auto"}|${languageCode}|${clean}`).digest("hex") + ".mp3";
}

async function cacheGet(key) {
    const client = s3();
    if (!client) return null;
    try {
        const { GetObjectCommand } = require("@aws-sdk/client-s3");
        const out = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const parts = [];
        for await (const chunk of out.Body) parts.push(chunk);
        return Buffer.concat(parts);
    } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode;
        if (err.name === "NoSuchKey" || err.name === "NotFound" || status === 404) return null;
        throw err;
    }
}

async function cachePut(key, buf) {
    const client = s3();
    if (!client) return;
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    await client.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: buf, ContentType: "audio/mpeg",
    }));
}

/**
 * Synthesize one chunk to MP3 bytes. Cached in S3 by a hash of voice + text, so
 * a repeat of the same text in the same voice costs nothing (no Google call).
 *
 * @param {{text: string, languageCode: string, voiceName: string}} opts
 * @returns {Promise<Buffer>} MP3 audio
 */
async function synthesize({ text, languageCode, voiceName }) {
    if (!isConfigured()) {
        const e = new Error("TTS not configured");
        e.code = "NO_KEY";
        throw e;
    }
    const clean = String(text || "").slice(0, MAX_CHARS);
    if (clean.trim() === "") {
        const e = new Error("Nothing to read");
        e.code = "EMPTY";
        throw e;
    }

    const cacheKey = audioKey({ text, languageCode, voiceName });

    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    // A specific voice name gives the chosen (e.g. Chirp 3 HD) voice; omitting it
    // lets Google pick a default voice for the language, so reading works even
    // before the user chooses HD voices.
    const voice = { languageCode };
    if (voiceName) voice.name = voiceName;

    const res = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${KEY}`,
        {
            input: { text: clean },
            voice,
            audioConfig: { audioEncoding: "MP3" },
        },
        { headers: { "content-type": "application/json" } }
    );

    const buf = Buffer.from(res.data.audioContent, "base64");
    await cachePut(cacheKey, buf);
    return buf;
}

/**
 * The voices available for a language (for the picker). Returns Google's voice
 * objects: { name, languageCodes, ssmlGender, ... }.
 *
 * @param {string} languageCode e.g. "en-US" or "he-IL"
 */
async function listVoices(languageCode) {
    if (!isConfigured()) return [];
    const res = await axios.get(
        `https://texttospeech.googleapis.com/v1/voices?key=${KEY}&languageCode=${encodeURIComponent(languageCode)}`
    );
    return res.data.voices || [];
}

module.exports = {
    audioKey, synthesize, listVoices, isConfigured, MAX_CHARS };
