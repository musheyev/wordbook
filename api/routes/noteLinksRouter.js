/**
 * HTTP routes for a note's links (mounted at /note-links in app.js). The
 * logic lives in ../note-links.js; links in a note's text are recorded when
 * notes are saved (wordbookRouter.js, dictionaryRouter.js).
 *
 *   GET /note-links?type=card|word&id=…
 *       -> { linksTo: [{ type, id, title, added?, inText?, missing? }], linkedFrom: [{ type, id, title }] }
 *   POST /note-links/added { type, id, title, links: [{ type, id }] }
 *       saves the links added in the note's row (🔗 Add link), replacing the
 *       ones added before -> the note's links, as GET returns them
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const noteLinks = require("../note-links");
const log = require("../logger");

const noteLinksRouter = express.Router();

// A note or a word, given as its type and id.
const isItem = (type, id) => ["card", "word"].includes(type) && typeof id === "string" && !!id.trim() && id.length <= 300;

// The signed-in user's name, or null after answering 401.
async function userOf(req, res) {
    const token = req.cookies && req.cookies.id_token;
    if (!token) { res.status(401).end("Please log in."); return null; }
    try {
        return await getCurentUserFromToken(token);
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
        return null;
    }
}

noteLinksRouter.get("/", async (req, res) => {
    const userName = await userOf(req, res);
    if (!userName) return;
    const { type, id } = req.query;
    if (!isItem(type, id)) return res.status(400).json({ error: "Choose a note or a word." });
    try {
        res.json(await noteLinks.linksFor(userName, type, id));
    } catch (err) {
        log("note links error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
});

noteLinksRouter.post("/added", async (req, res) => {
    const userName = await userOf(req, res);
    if (!userName) return;
    const { type, id, title, links } = req.body || {};
    if (!isItem(type, id)) return res.status(400).json({ error: "Choose a note or a word." });
    if (!Array.isArray(links) || links.length > 200 || links.some((l) => !l || !isItem(l.type, l.id))) {
        return res.status(400).json({ error: "Those links aren't right." });
    }
    try {
        const name = typeof title === "string" ? title.slice(0, 300) : "";
        await noteLinks.setAddedLinks(userName, { type, id, title: name }, links);
        res.json(await noteLinks.linksFor(userName, type, id));
    } catch (err) {
        log("note links save error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
});

module.exports = noteLinksRouter;
