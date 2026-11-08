/**
 * HTTP routes for saved quizzes (mounted at /quizzes in app.js). The logic
 * lives in ../quizzes.js.
 *
 *   GET    /quizzes       -> [ { id, name, notebook, cards, createdAt, updatedAt } ]
 *   PUT    /quizzes/:id   { name, notebook, cards } -> { id, name, updatedAt }
 *   DELETE /quizzes/:id   -> { ok: true }
 *
 * Admins only, using OpenAI (../stretch.js):
 *   POST   /quizzes/stretch         { notes, language, level, count, avoid } -> { cards }
 *   POST   /quizzes/second-opinion  { asked, answer, also, language, scene, heard } -> { correct, why }
 *
 * PUT both creates and replaces: the app makes the id, so saving the same
 * quiz twice (say, once offline and again when sent) does no harm.
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const quizzes = require("../quizzes");
const log = require("../logger");
const { isAdmin } = require("../cognitoUsers");
const { makeStretchCards, secondOpinion, StretchError } = require("../stretch");

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

// ---- Stretch and second opinion (../stretch.js) ----
// These cost money (OpenAI), so they're for admins only, like the quiz.
const adminOnly = async (req, res, next) => {
    if (await isAdmin(req.cookies.id_token)) return next();
    res.status(403).json({ error: "This is only for admins." });
};
const handleStretch = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof StretchError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        log("stretch error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
};

quizzesRouter.post("/stretch", adminOnly, handleStretch(async (req, res) => {
    res.json({ cards: await makeStretchCards(req.userName, req.body || {}) });
}));

quizzesRouter.post("/second-opinion", adminOnly, handleStretch(async (req, res) => {
    res.json(await secondOpinion(req.userName, req.body || {}));
}));

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
