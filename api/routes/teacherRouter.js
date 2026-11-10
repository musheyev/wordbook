/**
 * HTTP routes for the signed-in user's own teacher account (mounted at
 * /teacher in app.js). The logic lives in ../teachers.js; the admin side
 * (approve, decline, revoke, grant) is in adminRouter.js.
 *
 *   GET  /teacher/me        -> { status: "none" | "requested" | "active" | "declined" | "revoked", … }
 *   POST /teacher/request   { displayName, subject, level, students, country, agreeRules: true }
 *                           -> the new status; 400 / 409 / 429 / 403 with a message
 *
 * Teacher tools are used on a computer (the web app shows them only there),
 * but the server doesn't care which device asks.
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const teachers = require("../teachers");
const log = require("../logger");

const teacherRouter = express.Router();

// Every route needs the signed-in user, from the verified id_token cookie.
teacherRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/** A TeacherError answers with its own status and message; anything else is a 500. */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof teachers.TeacherError) return res.status(err.status).end(err.message);
        log(`teacher error on ${req.method} ${req.path}: ${err.name} ${err.message}`);
        res.status(500).end("Something went wrong. Try again.");
    }
};

teacherRouter.get("/me", handle(async (req, res) => {
    res.json(await teachers.getMine(req.userName));
}));

teacherRouter.post("/request", handle(async (req, res) => {
    res.json(await teachers.request(req.userName, req.body || {}));
}));

module.exports = teacherRouter;
