/**
 * HTTP routes for classrooms (mounted at /classrooms in app.js). The logic
 * and the rules for who may do what live in ../classrooms.js; every route
 * acts as the signed-in user, never a user named in the request.
 *
 *   GET    /classrooms                        My Classrooms: { teaching, joined, invited }
 *   POST   /classrooms               { title }            create (teachers)
 *   GET    /classrooms/:id                    the classroom, its items and members
 *   PATCH  /classrooms/:id           { title?, status? }  rename, close, reopen (its teacher)
 *   DELETE /classrooms/:id                    delete (its teacher)
 *   POST   /classrooms/:id/members   { username }         invite (its teacher)
 *   DELETE /classrooms/:id/members/:user      remove a student or invitation (its teacher)
 *   POST   /classrooms/:id/respond   { answer: "join" | "decline" }
 *   POST   /classrooms/:id/leave
 *   POST   /classrooms/:id/items     { type, id }         send a copy (its teacher)
 *   GET    /classrooms/:id/items/:item               one item, with its content
 *   DELETE /classrooms/:id/items/:item               take it out (its teacher)
 *   POST   /classrooms/:id/items/:item/save { wordbook | name, note? }   save a copy
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const classrooms = require("../classrooms");
const log = require("../logger");

const router = express.Router();

// Every route needs the signed-in user, from the verified id_token cookie.
router.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/** A ClassroomError answers with its own status and message; anything else is a 500. */
const handle = (fn) => async (req, res) => {
    try {
        res.json(await fn(req, res));
    } catch (err) {
        if (err instanceof classrooms.ClassroomError) return res.status(err.status).end(err.message);
        log(`classrooms error on ${req.method} ${req.path}: ${err.name} ${err.message}`);
        res.status(500).end("Something went wrong. Try again.");
    }
};
const body = (req) => req.body || {};
const ok = { ok: true };

router.get("/", handle((req) => classrooms.listMine(req.userName)));
router.post("/", handle((req) => classrooms.create(req.userName, body(req).title)));
router.get("/:id", handle((req) => classrooms.read(req.params.id, req.userName)));
router.patch("/:id", handle((req) => classrooms.update(req.params.id, req.userName, body(req))));
router.delete("/:id", handle(async (req) => { await classrooms.remove(req.params.id, req.userName); return ok; }));

router.post("/:id/members", handle((req) => classrooms.invite(req.params.id, req.userName, body(req).username)));
router.delete("/:id/members/:user", handle(async (req) => {
    await classrooms.removeMember(req.params.id, req.userName, req.params.user);
    return ok;
}));
router.post("/:id/respond", handle((req) => classrooms.respond(req.params.id, req.userName, body(req).answer)));
router.post("/:id/leave", handle(async (req) => { await classrooms.leave(req.params.id, req.userName); return ok; }));

router.post("/:id/items", handle((req) => classrooms.addItem(req.params.id, req.userName, body(req))));
router.get("/:id/items/:item", handle((req) => classrooms.readItem(req.params.id, req.userName, req.params.item)));
router.delete("/:id/items/:item", handle(async (req) => {
    await classrooms.removeItem(req.params.id, req.userName, req.params.item);
    return ok;
}));
router.post("/:id/items/:item/save", handle((req) =>
    classrooms.saveItem(req.params.id, req.userName, req.params.item, body(req))));

module.exports = router;
