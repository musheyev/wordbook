/**
 * HTTP routes for bookmarks, "My Bookmarks" (mounted at /bookmarks in app.js).
 * The logic lives in ../bookmarks.js.
 *
 *   GET    /bookmarks              -> [ { type, id, title, at } ], newest first
 *   PUT    /bookmarks/:type/:id    { title, at? } -> { type, id, title, at }
 *   DELETE /bookmarks/:type/:id    -> { ok: true }
 *   DELETE /bookmarks              -> { ok: true }   (all of them)
 *
 * :type is "card" (a note) or "word". PUT and DELETE are safe to repeat, so
 * changes made offline on the iPhone can be sent later as they are.
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const bookmarks = require("../bookmarks");
const log = require("../logger");

const bookmarksRouter = express.Router();

// Every route needs the signed-in user, from the verified id_token cookie.
bookmarksRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/** Turn errors into HTTP replies: BookmarkError keeps its status and message. */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof bookmarks.BookmarkError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        log("bookmarks error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
};

bookmarksRouter.get("/", handle(async (req, res) => {
    res.json(await bookmarks.listBookmarks(req.userName));
}));

bookmarksRouter.put("/:type/:id", handle(async (req, res) => {
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title : "";
    res.json(await bookmarks.addBookmark(req.userName, req.params.type, req.params.id, title, body.at));
}));

bookmarksRouter.delete("/:type/:id", handle(async (req, res) => {
    await bookmarks.removeBookmark(req.userName, req.params.type, req.params.id);
    res.json({ ok: true });
}));

bookmarksRouter.delete("/", handle(async (req, res) => {
    await bookmarks.clearBookmarks(req.userName);
    res.json({ ok: true });
}));

module.exports = bookmarksRouter;
