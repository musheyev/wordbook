/**
 * Note image routes (mounted at /images in app.js). Logic in ../images.js.
 *
 *   POST /images            raw image bytes (Content-Type: image/*) -> { url }
 *   GET  /images/<name>     the stored image bytes
 *
 * Signed-in only (both routes): keeps images out of anonymous reach. Any
 * logged-in user may view — needed so shared notes render for the recipient —
 * and the random filename is the capability.
 */
const express = require("express");
const images = require("../images");
const log = require("../logger");
const { getCurentUserFromToken } = require("../auth");

const imagesRouter = express.Router();

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

// Filenames are "<uuid>.<ext>" — reject anything else (path traversal, etc.).
const NAME_RE = /^[A-Za-z0-9-]+\.(png|jpg|gif|webp)$/;

imagesRouter.post(
    "/",
    requireUser,
    express.raw({ type: ["image/*", "application/octet-stream"], limit: "12mb" }),
    async (req, res) => {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            return res.status(400).end("No image data.");
        }
        try {
            const name = await images.putImage(req.body, req.get("content-type"));
            res.json({ url: `/api/images/${name}` });
        } catch (err) {
            if (err.code === "NO_BUCKET") return res.status(503).end("Image uploads aren't configured on the server yet.");
            if (err.code === "BAD_TYPE") return res.status(415).end("Unsupported image type.");
            log("image upload error: " + err);
            res.status(502).end("Could not store image.");
        }
    }
);

imagesRouter.get("/:name", requireUser, async (req, res) => {
    const { name } = req.params;
    if (!NAME_RE.test(name)) return res.status(400).end("Bad image name.");
    try {
        const img = await images.getImage(name);
        if (!img) return res.status(404).end("Not found.");
        res.set("Content-Type", img.contentType);
        res.set("Cache-Control", "private, max-age=86400");
        res.send(img.buffer);
    } catch (err) {
        log("image serve error: " + err);
        res.status(502).end("Could not load image.");
    }
});

module.exports = imagesRouter;
