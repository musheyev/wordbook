/**
 * HTTP route for a note's links (mounted at /note-links in app.js). The logic
 * lives in ../note-links.js; links are recorded when notes are saved
 * (wordbookRouter.js, dictionaryRouter.js).
 *
 *   GET /note-links?type=card|word&id=…
 *       -> { linksTo: [{ type, id, title, missing? }], linkedFrom: [{ type, id, title }] }
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const noteLinks = require("../note-links");
const log = require("../logger");

const noteLinksRouter = express.Router();

noteLinksRouter.get("/", async (req, res) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    let userName;
    try {
        userName = await getCurentUserFromToken(token);
    } catch (err) {
        return res.status(401).end("Your login session expired.  Please login again.");
    }
    const { type, id } = req.query;
    if (!["card", "word"].includes(type) || typeof id !== "string" || !id.trim() || id.length > 300) {
        return res.status(400).json({ error: "Choose a note or a word." });
    }
    try {
        res.json(await noteLinks.linksFor(userName, type, id));
    } catch (err) {
        log("note links error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
});

module.exports = noteLinksRouter;
