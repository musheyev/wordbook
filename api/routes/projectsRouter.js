/**
 * HTTP routes for My Projects (mounted at /projects in app.js). The logic
 * lives in ../projects.js.
 *
 *   GET    /projects                          -> { projects: [...], tasks: [...] }
 *   POST   /projects                { name }  -> project
 *   PUT    /projects/:projectId      { name }  -> project (renamed)
 *   DELETE /projects/:projectId               -> { ok: true }  (and all its tasks)
 *   POST   /projects/:projectId/tasks          { name, days, after, start, who, notes, order? } -> task
 *   PUT    /projects/:projectId/tasks/:taskId  (the whole task, as for POST) -> task
 *   DELETE /projects/:projectId/tasks/:taskId  { starts? } -> { changed: [tasks] }
 *
 * A project:  { id, name, created_at }
 * A task:     { id, projectId, name, days, after, start, who, notes: [{ type, id, title }], order }
 */
const express = require("express");
const { getCurentUserFromToken } = require("../auth");
const projects = require("../projects");
const log = require("../logger");

const projectsRouter = express.Router();

// Every route needs the signed-in user, from the verified id_token cookie.
projectsRouter.use(async (req, res, next) => {
    const token = req.cookies && req.cookies.id_token;
    if (!token) return res.status(401).end("Please log in.");
    try {
        req.userName = await getCurentUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).end("Your login session expired.  Please login again.");
    }
});

/** Turn errors into HTTP replies: ProjectError keeps its status and message. */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof projects.ProjectError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        log("projects error: " + err);
        res.status(500).json({ error: "Something went wrong." });
    }
};

projectsRouter.get("/", handle(async (req, res) => {
    res.json(await projects.listAll(req.userName));
}));

projectsRouter.post("/", handle(async (req, res) => {
    res.json(await projects.createProject(req.userName, req.body));
}));

projectsRouter.put("/:projectId", handle(async (req, res) => {
    res.json(await projects.renameProject(req.userName, req.params.projectId, req.body));
}));

projectsRouter.delete("/:projectId", handle(async (req, res) => {
    await projects.deleteProject(req.userName, req.params.projectId);
    res.json({ ok: true });
}));

projectsRouter.post("/:projectId/tasks", handle(async (req, res) => {
    res.json(await projects.createTask(req.userName, req.params.projectId, req.body));
}));

projectsRouter.put("/:projectId/tasks/:taskId", handle(async (req, res) => {
    res.json(await projects.updateTask(req.userName, req.params.projectId, req.params.taskId, req.body));
}));

projectsRouter.delete("/:projectId/tasks/:taskId", handle(async (req, res) => {
    const starts = req.body && req.body.starts;
    res.json(await projects.deleteTask(req.userName, req.params.projectId, req.params.taskId, starts));
}));

module.exports = projectsRouter;
