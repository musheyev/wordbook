/**
 * Word images users add themselves (mounted at /word-images in app.js).
 * Logic in ../user-word-images.js.
 *
 *   GET  /word-images/mine?word=…              -> { images }   the user's own
 *   POST /word-images/upload?word=…&shared=1   raw image bytes  -> { images, shared? }
 *   POST /word-images/link { word, url, shared }               -> { images, shared? }
 *   POST /word-images/remove { word, url }                     -> { images }
 *   POST /word-images/restore { word, url }    undo a remove    -> { images }
 *   POST /word-images/share { word, url }      admin: make one of their own
 *                                              images available to everyone
 *                                              -> { images, shared }
 *   GET  /word-images/<name>                   the image file (public)
 *
 * `shared` on upload/link (admins only) puts the new image straight into
 * the word's shared images instead of the admin's own. Replies with
 * `shared` also carry the word's shared images after the change.
 *
 * Everything except reading a file needs a signed-in user. Files are public
 * because shared word images show to everyone, including visitors who
 * aren't logged in; the random filename keeps a private image unguessable.
 */
const express = require("express");
const userImages = require("../user-word-images");
const curation = require("../image-curation");
const images = require("../images");
const { getCurentUserFromToken } = require("../auth");
const { isAdmin } = require("../cognitoUsers");
const log = require("../logger");

const router = express.Router();

async function requireUser(req, res, next) {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired. Please log in again.");
    }
}

// Errors with their own status (bad input, full list, full shared slots)
// are shown to the user; anything else is logged and reported generically.
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof userImages.UserImageError || err instanceof curation.CurationError) {
            return res.status(err.status).end(err.message);
        }
        log(`word image error on ${req.method} ${req.path}: ${err.name} ${err.message}`);
        res.status(500).end("Something went wrong. Try again.");
    }
};

// Store a new image (already saved as a file) for the user, or — for an
// admin who asked — straight into the word's shared images.
async function addNew(req, res, url, wantsShared) {
    const word = req.body && req.body.word !== undefined ? req.body.word : req.query.word;
    if (wantsShared) {
        if (!await isAdmin(req.cookies.id_token)) {
            return res.status(403).end("Only admins can add images for everyone.");
        }
        const shared = await curation.addSharedImage(userImages.normalizeWord(word), url);
        return res.json({ images: await userImages.listImages(req.userName, word), shared });
    }
    res.json({ images: await userImages.addImages(req.userName, word, [url], { strict: true }) });
}

const wantsShared = (value) => value === true || value === "1" || value === "true";

router.get("/mine", requireUser, handle(async (req, res) => {
    res.json({ images: await userImages.listImages(req.userName, req.query.word) });
}));

router.post(
    "/upload",
    requireUser,
    express.raw({ type: ["image/*", "application/octet-stream"], limit: "12mb" }),
    handle(async (req, res) => {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            return res.status(400).end("No image data.");
        }
        // Check the word and the list's room before storing a file for it.
        const word = req.query.word;
        const shared = wantsShared(req.query.shared);
        if (!shared) await userImages.addImages(req.userName, word, [], { strict: true });
        const url = await userImages.storeUpload(req.body);
        await addNew(req, res, url, shared);
    })
);

router.post("/link", requireUser, handle(async (req, res) => {
    const { word, url: link } = req.body || {};
    const shared = wantsShared(req.body && req.body.shared);
    const current = await userImages.listImages(req.userName, word);
    if (!shared && current.length >= userImages.MAX_PER_WORD) {
        return res.status(400).end(`You can add up to ${userImages.MAX_PER_WORD} images to a word. Remove one first.`);
    }
    const url = await userImages.storeFromLink(link);
    await addNew(req, res, url, shared);
}));

router.post("/remove", requireUser, handle(async (req, res) => {
    res.json({ images: await userImages.removeImage(req.userName, req.body.word, req.body.url) });
}));

router.post("/restore", requireUser, handle(async (req, res) => {
    res.json({ images: await userImages.addImages(req.userName, req.body.word, [req.body.url]) });
}));

router.post("/share", requireUser, handle(async (req, res) => {
    if (!await isAdmin(req.cookies.id_token)) {
        return res.status(403).end("Only admins can make images available to everyone.");
    }
    const { word, url } = req.body || {};
    const mine = await userImages.listImages(req.userName, word);
    if (!mine.includes(url)) return res.status(404).end("That image isn't one of yours.");
    const shared = await curation.addSharedImage(userImages.normalizeWord(word), url);
    res.json({ images: await userImages.removeImage(req.userName, word, url), shared });
}));

// Filenames are "<uuid>.<ext>"; anything else is refused (path traversal etc.).
const NAME_RE = /^[A-Za-z0-9-]+\.(png|jpg|gif|webp)$/;

router.get("/:name", async (req, res) => {
    const { name } = req.params;
    if (!NAME_RE.test(name)) return res.status(400).end("Bad image name.");
    try {
        const img = await images.getImage(name, images.WORD_PREFIX);
        if (!img) return res.status(404).end("Not found.");
        res.set("Content-Type", img.contentType);
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.set("X-Content-Type-Options", "nosniff");
        res.send(img.buffer);
    } catch (err) {
        log("word image serve error: " + err);
        res.status(502).end("Could not load image.");
    }
});

module.exports = router;
