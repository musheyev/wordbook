/**
 * Admin-only routes (mounted at /admin in app.js).
 *
 *   GET  /admin/images?cursor=…         every image in the system, a page at a time
 *   POST /admin/images/delete { items: [{ word, url }, …] }
 *   GET  /admin/teachers?status=requested|active|declined|revoked
 *   GET  /admin/teachers/count          { requests } waiting for review
 *   POST /admin/teachers/:user/approve | /decline { reason? } | /revoke
 *   POST /admin/teachers/grant { username, displayName? }   free, no request
 *
 * `requireAdmin` (cognitoUsers.js) runs first on every route here: it checks
 * the id_token and membership in the Cognito "admins" group, and answers 401
 * or 403 otherwise. That server-side check is the real protection; the
 * frontend only hides admin screens as a convenience.
 */
const express = require("express");
const { requireAdmin } = require("../cognitoUsers");
const curation = require("../image-curation");
const imageGc = require("../image-gc");
const appSettings = require("../app-settings");
const ttsGc = require("../tts-gc");
const teachers = require("../teachers");
const classrooms = require("../classrooms");
const { findUsername } = require("../cognitoUsers");
const { decodeToken } = require("../auth");
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

// --- Brave image search on/off for the whole app. See ../app-settings.js. ---
// GET -> { enabled }; POST { enabled } -> { enabled }
adminRouter.get("/image-search", handle(async (req, res) => {
    res.json({ enabled: await appSettings.isImageSearchEnabled() });
}));

adminRouter.post("/image-search", handle(async (req, res) => {
    if (typeof req.body.enabled !== "boolean") {
        return res.status(400).end("Send enabled: true or false.");
    }
    const admin = (await decodeToken(req.cookies.id_token))["cognito:username"];
    res.json({ enabled: await appSettings.setImageSearchEnabled(req.body.enabled, admin) });
}));

// --- Note-image cleanup (archive / restore / clear). See ../image-gc.js. ---
const needImages = (res) => {
    if (!imageGc.isConfigured()) {
        res.status(503).json({ error: "Image storage isn't configured on the server." });
        return false;
    }
    return true;
};

adminRouter.get("/image-archive", handle(async (req, res) => {
    res.json(await imageGc.archiveCount());
}));

adminRouter.post("/image-archive/sweep", handle(async (req, res) => {
    if (!needImages(res)) return;
    res.json(await imageGc.archiveOrphans());
}));

adminRouter.post("/image-archive/restore", handle(async (req, res) => {
    if (!needImages(res)) return;
    res.json(await imageGc.restoreAll());
}));

adminRouter.post("/image-archive/clear", handle(async (req, res) => {
    if (!needImages(res)) return;
    res.json(await imageGc.clearArchive());
}));

// --- Read-aloud audio cleanup (archive / restore / clear). See ../tts-gc.js. ---
const needAudioStorage = (res) => {
    if (!ttsGc.isConfigured()) {
        res.status(503).json({ error: "Audio storage isn't configured on the server." });
        return false;
    }
    return true;
};

adminRouter.get("/audio-archive", handle(async (req, res) => {
    res.json(await ttsGc.status());
}));

adminRouter.post("/audio-archive/sweep", handle(async (req, res) => {
    if (!needAudioStorage(res)) return;
    res.json(await ttsGc.archiveUnused());
}));

adminRouter.post("/audio-archive/restore", handle(async (req, res) => {
    if (!needAudioStorage(res)) return;
    res.json(await ttsGc.restoreAll());
}));

adminRouter.post("/audio-archive/clear", handle(async (req, res) => {
    if (!needAudioStorage(res)) return;
    res.json(await ttsGc.clearArchive());
}));

// --- Teacher accounts (../teachers.js): review requests, revoke, grant. ---
// TeacherError carries its own status and message (e.g. 409 when another
// admin decided first).
const teacherRoute = (fn) => handle(async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof teachers.TeacherError) return res.status(err.status).end(err.message);
        throw err;
    }
});
const adminName = async (req) => (await decodeToken(req.cookies.id_token))["cognito:username"];

adminRouter.get("/teachers", teacherRoute(async (req, res) => {
    res.json(await teachers.listByStatus(req.query.status || "requested"));
}));

adminRouter.get("/teachers/count", teacherRoute(async (req, res) => {
    res.json({ requests: await teachers.countRequests() });
}));

adminRouter.post("/teachers/grant", teacherRoute(async (req, res) => {
    const typed = String((req.body && req.body.username) || "").trim();
    const userName = typed ? await findUsername(typed) : null;
    if (!userName) return res.status(404).end(`There's no account named "${typed}".`);
    res.json(await teachers.grant(userName, await adminName(req), req.body.displayName));
}));

adminRouter.post("/teachers/:user/:action(approve|decline|revoke)", teacherRoute(async (req, res) => {
    const { user, action } = req.params;
    const admin = await adminName(req);
    if (action === "approve") return res.json(await teachers.approve(user, admin));
    if (action === "decline") return res.json(await teachers.decline(user, admin, req.body && req.body.reason));
    const revoked = await teachers.revoke(user, admin);
    // Revoking closes the teacher's classrooms (students lose access; the
    // teacher can't reopen them until they're a teacher again).
    await classrooms.closeAllFor(user);
    return res.json(revoked);
}));

module.exports = { adminRouter, handle };
