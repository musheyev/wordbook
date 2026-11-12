/**
 * HTTP routes for recent notes (mounted at /recent-notes in app.js). The
 * logic lives in ../recent-notes.js.
 *
 *   GET /recent-notes             -> [ { type, id, wordbook, title, at } ], newest first
 *   PUT /recent-notes/:type/:id   { wordbook, title } -> { type, id, wordbook, title, at }
 *
 * :type is "card" (a note) or "word". PUT is what the app sends each time a
 * note or word is opened; sending it twice is harmless (the second just
 * updates the time).
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const recent = require("../recent-notes");
const log = require("../logger");

const recentNotesRouter = express.Router();

// Every route needs the signed-in user, from the verified id_token cookie
// (the same check bookmarksRouter.js makes).
recentNotesRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/** Turn errors into HTTP replies: RecentError keeps its status and message. */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof recent.RecentError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        log("recent notes error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
};

recentNotesRouter.get("/", handle(async (req, res) => {
    res.json(await recent.listRecent(req.userName));
}));

recentNotesRouter.put("/:type/:id", handle(async (req, res) => {
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title : "";
    res.json(await recent.noteOpened(req.userName, req.params.type, req.params.id, body.wordbook, title));
}));

module.exports = recentNotesRouter;
