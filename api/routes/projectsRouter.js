/**
 * HTTP routes for My Projects (mounted at /projects in app.js). The logic
 * lives in ../projects.js.
 *
 *   GET    /projects                          -> { projects, tasks, groups, layout, holidays }
 *   PUT    /projects/layout          { widths, folded, tableFolded } -> layout (the table's columns)
 *   PUT    /projects/holidays        [{ date, name }] -> the list as kept (skipped like weekends, all projects)
 *   POST   /projects                { name }  -> project
 *   PUT    /projects/:projectId      { name }  -> project (renamed)
 *   DELETE /projects/:projectId               -> { ok: true }  (and all its tasks)
 *   POST   /projects/:projectId/tasks          { name, days, after, start, who, notes, order? } -> task
 *   PUT    /projects/:projectId/tasks/:taskId  (the whole task, as for POST) -> task
 *   DELETE /projects/:projectId/tasks/:taskId  { starts? } -> { changed: [tasks] }
 *
 *   POST   /projects/:projectId/groups            { name } -> { projectId, tasks, groups, group }
 *   PUT    /projects/:projectId/groups/:groupId   { name } -> { projectId, tasks, groups }  (rename)
 *   DELETE /projects/:projectId/groups/:groupId   -> { projectId, tasks, groups }  (ungroup: its tasks stay)
 *   PUT    /projects/:projectId/arrange           { groups: [{ id, order }], tasks: [{ id, group, order }] }
 *          -> { projectId, tasks, groups }  (new places, and which group each task is in)
 *
 * Offline: "make" routes take an `id` the web app made (sending it again is
 * harmless), and changes made offline take `changedAt`; if what's stored
 * changed after that, it's kept and the answer says `kept: "theirs"`.
 *
 * A project:  { id, name, created_at }
 * A task:     { id, projectId, name, days, after, start, who, notes: [{ type, id, title }], order, group }
 * A group:    { id, projectId, name, order }
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

// Before "/:projectId", or "layout" would be taken for a project's id.
projectsRouter.put("/layout", handle(async (req, res) => {
    res.json(await projects.setLayout(req.userName, req.body));
}));

// Before "/:projectId" too.
projectsRouter.put("/holidays", handle(async (req, res) => {
    res.json(await projects.setHolidays(req.userName, req.body));
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
    const body = req.body || {};
    res.json(await projects.deleteTask(req.userName, req.params.projectId, req.params.taskId, body.starts, body.changedAt));
}));

projectsRouter.post("/:projectId/groups", handle(async (req, res) => {
    res.json(await projects.createGroup(req.userName, req.params.projectId, req.body));
}));

projectsRouter.put("/:projectId/groups/:groupId", handle(async (req, res) => {
    res.json(await projects.renameGroup(req.userName, req.params.projectId, req.params.groupId, req.body));
}));

projectsRouter.delete("/:projectId/groups/:groupId", handle(async (req, res) => {
    res.json(await projects.ungroup(req.userName, req.params.projectId, req.params.groupId));
}));

projectsRouter.put("/:projectId/arrange", handle(async (req, res) => {
    res.json(await projects.arrange(req.userName, req.params.projectId, req.body));
}));

module.exports = projectsRouter;
