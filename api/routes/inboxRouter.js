/**
 * HTTP routes for sharing and the Inbox (mounted at /inbox in app.js).
 * The logic lives in ../inbox.js; this file only translates between HTTP
 * (request bodies, status codes) and those functions.
 *
 *   POST /inbox/share   { to, item: { type, id } }  -> "Sent" (always, see inbox.js)
 *   GET  /inbox                                     -> [ { id, type, title, preview, from, sharedAt } ]
 *   POST /inbox/get     { id }                      -> one item, with a note's content
 *   POST /inbox/move    { id, wordbook }            -> { type, id } of the item in the notebook
 *   POST /inbox/remove  { id }                      -> "Done"
 *
 * Inbox ids contain "#" and ":", awkward in a URL path, so they travel in
 * JSON bodies — the same reason the card routes use POST /wordbook/card/get.
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const inbox = require("../inbox");
const log = require("../logger");

const inboxRouter = express.Router();

/**
 * Router-level middleware: every inbox route needs the signed-in user, so
 * resolve it once here and put it on req.userName. The username comes only
 * from the verified id_token cookie — never from the request body — so no one
 * can act as, or send as, someone else.
 */
inboxRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) {
        return res.status(401).end("Please log in.");
    }
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/**
 * Wrap an async route so any error becomes a proper HTTP reply: InboxError
 * carries its own status and user-facing message; anything unexpected is
 * logged and reported as a generic 500 (never leaking internal details).
 */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof inbox.InboxError) {
            return res.status(err.status).end(err.message);
        }
        log(`inbox error on ${req.method} ${req.path}: ${err.name} ${err.message}`);
        res.status(500).end("Something went wrong. Try again.");
    }
};

inboxRouter.post("/share", handle(async (req, res) => {
    await inbox.shareItem(req.userName, req.body.to, req.body.item);
    res.status(200).end("Sent");
}));

inboxRouter.get("/", handle(async (req, res) => {
    res.json(await inbox.listInbox(req.userName));
}));

inboxRouter.post("/get", handle(async (req, res) => {
    res.json(await inbox.getItem(req.userName, req.body.id));
}));

inboxRouter.post("/move", handle(async (req, res) => {
    res.json(await inbox.moveItem(req.userName, req.body.id, req.body.wordbook));
}));

inboxRouter.post("/remove", handle(async (req, res) => {
    await inbox.removeItem(req.userName, req.body.id);
    res.status(200).end("Done");
}));

module.exports = inboxRouter;
