/**
 * HTTP routes for tags (mounted at /tags in app.js). Logic lives in ../tags.js.
 *
 *   GET  /tags?type=&id=   -> { tags: [...] }   one item's tags
 *   GET  /tags/all         -> [ { type, id, title, tags } ]  every tagged item
 *   POST /tags             { type, id, tags, title } -> { tags: [...] }  replace
 */
const express = require("express");
const tags = require("../tags");
const log = require("../logger");

const tagsRouter = express.Router();

tagsRouter.get("/all", async function (req, res) {
    try {
        res.json(await tags.listTagged(req.cookies.id_token));
    } catch (err) {
        log("tags list error: " + err);
        res.status(500).json([]);
    }
});

tagsRouter.get("/", async function (req, res) {
    try {
        const list = await tags.getTags(req.cookies.id_token, req.query.type, req.query.id);
        res.json({ tags: list });
    } catch (err) {
        log("tags get error: " + err);
        res.status(500).json({ tags: [] });
    }
});

tagsRouter.post("/", async function (req, res) {
    const { type, id, tags: list, title } = req.body || {};
    if (!type || !id) {
        return res.status(400).json({ error: "type and id are required" });
    }
    try {
        const saved = await tags.setTags(req.cookies.id_token, type, id, list, title);
        res.json({ tags: saved });
    } catch (err) {
        log("tags set error: " + err);
        res.status(500).json({ error: "Could not save tags" });
    }
});

module.exports = tagsRouter;
