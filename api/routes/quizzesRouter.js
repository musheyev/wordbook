/**
 * HTTP routes for saved quizzes (mounted at /quizzes in app.js). The logic
 * lives in ../quizzes.js.
 *
 *   GET    /quizzes       -> [ { id, name, notebook, cards, createdAt, updatedAt } ]
 *   PUT    /quizzes/:id   { name, notebook, cards } -> { id, name, updatedAt }
 *   DELETE /quizzes/:id   -> { ok: true }
 *
 * PUT both creates and replaces: the app makes the id, so saving the same
 * quiz twice (say, once offline and again when sent) does no harm.
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const quizzes = require("../quizzes");
const log = require("../logger");

const quizzesRouter = express.Router();

// Every route needs the signed-in user, from the verified id_token cookie.
quizzesRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/** Turn errors into HTTP replies: QuizError keeps its status and message. */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof quizzes.QuizError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        log("quizzes error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
};

quizzesRouter.get("/", handle(async (req, res) => {
    res.json(await quizzes.listQuizzes(req.userName));
}));

quizzesRouter.put("/:id", handle(async (req, res) => {
    res.json(await quizzes.saveQuiz(req.userName, req.params.id, req.body || {}));
}));

quizzesRouter.delete("/:id", handle(async (req, res) => {
    await quizzes.deleteQuiz(req.userName, req.params.id);
    res.json({ ok: true });
}));

module.exports = quizzesRouter;
