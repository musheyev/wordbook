/**
 * Admin-only routes (mounted at /admin in app.js).
 *
 *   GET  /admin/images?cursor=…         every image in the system, a page at a time
 *   POST /admin/images/delete { items: [{ word, url }, …] }
 *
 * `requireAdmin` (cognitoUsers.js) runs first on every route here: it checks
 * the id_token and membership in the Cognito "admins" group, and answers 401
 * or 403 otherwise. That server-side check is the real protection; the
 * frontend only hides admin screens as a convenience.
 */
const express = require("express");
const { requireAdmin } = require("../cognitoUsers");
const curation = require("../image-curation");
const log = require("../logger");

const adminRouter = express.Router();
adminRouter.use(requireAdmin);

/**
 * Wrap an async route: CurationError carries its own status and message;
 * anything else is logged and reported as a generic 500.
 */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof curation.CurationError) {
            return res.status(err.status).end(err.message);
        }
        log(`admin error on ${req.method} ${req.path}: ${err.name} ${err.message}`);
        res.status(500).end("Something went wrong. Try again.");
    }
};

adminRouter.get("/images", handle(async (req, res) => {
    res.json(await curation.listAllImages(req.query.cursor));
}));

adminRouter.post("/images/delete", handle(async (req, res) => {
    res.json(await curation.deleteImages(req.body.items));
}));

module.exports = { adminRouter, handle };
