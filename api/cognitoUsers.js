// Shared Cognito helpers for the admin user/admin listings.
const log = require("./logger");
const decodeToken = require("./auth").decodeToken;
const {
    CognitoIdentityProviderClient,
    ListUsersCommand,
    ListUsersInGroupCommand,
    AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const REGION =
    process.env.COGNITO_REGION || process.env.AWS_REGION || "us-east-1";
const POOL_ID =
    process.env.COGNITO_USER_POOL_ID || "us-east-1_zFsf56WQR";

// Credentials resolve from the default AWS provider chain (env / role), the
// same as the DynamoDB client.
const client = new CognitoIdentityProviderClient({ region: REGION });

// Express middleware: verify the id_token cookie and require membership in the
// "admins" group. This is the real gate; the frontend guard is convenience.
async function requireAdmin(req, res, next) {
    try {
        const token = req.cookies && req.cookies.id_token;
        if (!token) {
            return res.status(401).json({ error: "Not signed in" });
        }
        const decoded = await decodeToken(token);
        const groups = decoded["cognito:groups"] || [];
        if (!Array.isArray(groups) || !groups.includes("admins")) {
            return res.status(403).json({ error: "Admins only" });
        }
        next();
    } catch (err) {
        log(`admin auth failed: ${err}`);
        return res.status(401).json({ error: "Invalid session" });
    }
}

// True if the id_token is valid and its user is in the "admins" group; false
// otherwise (never throws). For routes open to everyone where admins get an
// extra option.
async function isAdmin(token) {
    if (!token) return false;
    try {
        const groups = (await decodeToken(token))["cognito:groups"] || [];
        return Array.isArray(groups) && groups.includes("admins");
    } catch (err) {
        return false;
    }
}

function attr(user, name) {
    const found = (user.Attributes || []).find((a) => a.Name === name);
    return found ? found.Value : undefined;
}

function mapUser(u) {
    const fullName =
        attr(u, "name") ||
        [attr(u, "given_name"), attr(u, "family_name")].filter(Boolean).join(" ") ||
        attr(u, "preferred_username") ||
        u.Username;

    return {
        id: attr(u, "sub") || u.Username,
        name: fullName,
        email: attr(u, "email") || "",
        status: u.UserStatus,
        enabled: u.Enabled,
    };
}

// All users in the pool (ListUsers paginates with PaginationToken).
async function listAllUsers() {
    const users = [];
    let PaginationToken;
    do {
        const out = await client.send(
            new ListUsersCommand({ UserPoolId: POOL_ID, Limit: 60, PaginationToken })
        );
        (out.Users || []).forEach((u) => users.push(mapUser(u)));
        PaginationToken = out.PaginationToken;
    } while (PaginationToken);
    return users;
}

// Members of a group (ListUsersInGroup paginates with NextToken).
async function listUsersInGroup(group) {
    const users = [];
    let NextToken;
    do {
        const out = await client.send(
            new ListUsersInGroupCommand({
                UserPoolId: POOL_ID,
                GroupName: group,
                Limit: 60,
                NextToken,
            })
        );
        (out.Users || []).forEach((u) => users.push(mapUser(u)));
        NextToken = out.NextToken;
    } while (NextToken);
    return users;
}

/**
 * Look up one user by username, for sharing (api/inbox.js).
 *
 * Returns the username exactly as Cognito stores it, which matters because
 * every table is keyed by that exact string: if the pool treats usernames as
 * case-insensitive, "Bob" typed by a sender must still land in "bob"'s inbox.
 *
 * @param {string} username as typed by the sender
 * @returns {Promise<string|null>} canonical username, or null if there's no
 *   such user or the account is disabled
 */
async function findUsername(username) {
    try {
        const out = await client.send(
            new AdminGetUserCommand({ UserPoolId: POOL_ID, Username: username })
        );
        return out.Enabled === false ? null : out.Username;
    } catch (err) {
        if (err.name === "UserNotFoundException") {
            return null;
        }
        throw err;
    }
}

module.exports = { requireAdmin, isAdmin, listAllUsers, listUsersInGroup, findUsername, POOL_ID };
