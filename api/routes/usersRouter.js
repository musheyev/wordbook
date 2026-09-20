const express = require("express");
const log = require("../logger");
const { requireAdmin, listAllUsers } = require("../cognitoUsers");

let router = express.Router();

// Admin-only: list every user in the Cognito pool.
router.get("", requireAdmin, async function (req, res) {
    try {
        res.json(await listAllUsers());
    } catch (err) {
        log(`/users ListUsers failed: ${err}`);
        res.status(500).json({ error: "Could not list users" });
    }
});

module.exports = router;
