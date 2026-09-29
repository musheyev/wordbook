/**
 * Text-to-speech routes (mounted at /tts in app.js). Logic in ../tts.js.
 *
 *   GET  /tts/voices?lang=en-US   -> { voices: [...] }  available voices
 *   POST /tts   { text, languageCode, voiceName }  -> audio/mpeg bytes
 *
 * Signed-in only: keeps the Google key server-side and lets us attribute usage.
 */
const express = require("express");
const tts = require("../tts");
const log = require("../logger");
const { getCurentUserFromToken } = require("../auth");

const ttsRouter = express.Router();

ttsRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired. Please log in again.");
    }
});

ttsRouter.get("/voices", async (req, res) => {
    try {
        const voices = await tts.listVoices(req.query.lang || "en-US");
        res.json({ voices });
    } catch (err) {
        log("tts voices error: " + err);
        res.status(500).json({ voices: [] });
    }
});

ttsRouter.post("/", async (req, res) => {
    const { text, languageCode, voiceName } = req.body || {};
    if (!text || !languageCode) {
        return res.status(400).end("text and languageCode are required");
    }
    try {
        const audio = await tts.synthesize({ text, languageCode, voiceName });
        res.set("Content-Type", "audio/mpeg");
        res.set("Cache-Control", "private, max-age=86400");
        res.send(audio);
    } catch (err) {
        if (err.code === "NO_KEY") {
            return res.status(503).end("Read-aloud isn't configured on the server yet.");
        }
        if (err.code === "EMPTY") {
            return res.status(400).end("Nothing to read.");
        }
        log("tts synth error: " + (err.response ? JSON.stringify(err.response.data) : err));
        res.status(502).end("Could not generate audio.");
    }
});

module.exports = ttsRouter;
