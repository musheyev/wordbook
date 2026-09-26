const express = require("express");
const log = require("../logger");
const { requireAdmin, listUsersInGroup } = require("../cognitoUsers");

let router = express.Router();

// Admin-only: list members of the "admins" Cognito group.
router.get("", requireAdmin, async function (req, res) {
    try {
        res.json(await listUsersInGroup("admins"));
    } catch (err) {
        log(`/admins ListUsersInGroup failed: ${err}`);
        res.status(500).json({ error: "Could not list admins" });
    }
});

module.exports = router;
