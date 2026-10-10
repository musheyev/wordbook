// Tags: labels a user attaches to items (a dictionary word or a note), cutting
// across notebooks. One row per (user, item) holds that item's tag list, in
// `dictionary_item_tags` (PK user_name, SK item_key = "<type>#<id>").
const database = require("./dynamoDb");
const getCurentUserFromToken = require("./auth").getCurentUserFromToken;

const TABLE = "dictionary_item_tags";
const MAX_TAG_LEN = 40;
const MAX_TAGS = 30;

const itemKey = (type, id) => `${type}#${id}`;

// Trim, drop empties/over-long, de-dupe case-insensitively (keeping the first
// spelling), and cap the count.
function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const seen = new Set();
    const out = [];
    for (let t of tags) {
        if (typeof t !== "string") continue;
        t = t.trim();
        if (t === "" || t.length > MAX_TAG_LEN) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
        if (out.length >= MAX_TAGS) break;
    }
    return out;
}

async function getTags(userIdToken, type, id) {
    if (!userIdToken || !type || !id) return [];
    const userName = await getCurentUserFromToken(userIdToken);
    const data = await database.dynamoDbClientInstance().get({
        TableName: TABLE,
        Key: { user_name: userName, item_key: itemKey(type, id) },
    }).promise();
    return data.Item && Array.isArray(data.Item.tags) ? data.Item.tags : [];
}

// Replace an item's tags. Empty list deletes the row so it never shows up in
// the tag browser as an item with no tags.
async function setTags(userIdToken, type, id, tags, title) {
    const userName = await getCurentUserFromToken(userIdToken);
    const clean = normalizeTags(tags);
    const Key = { user_name: userName, item_key: itemKey(type, id) };
    if (clean.length === 0) {
        await database.dynamoDbClientInstance().delete({ TableName: TABLE, Key }).promise();
        return [];
    }
    await database.dynamoDbClientInstance().put({
        TableName: TABLE,
        Item: {
            ...Key,
            item_type: type,
            item_id: id,
            title: (typeof title === "string" && title.trim()) ? title.trim() : id,
            tags: clean,
            updated_at: new Date().toISOString(),
        },
    }).promise();
    return clean;
}

// Every tagged item for a user (for the tag browser). The client groups by tag.
async function listTagged(userIdToken) {
    if (!userIdToken) return [];
    const userName = await getCurentUserFromToken(userIdToken);
    const items = [];
    let lastKey;
    do {
        const page = await database.dynamoDbClientInstance().query({
            TableName: TABLE,
            KeyConditionExpression: "user_name = :u",
            ExpressionAttributeValues: { ":u": userName },
            ExclusiveStartKey: lastKey,
        }).promise();
        (page.Items || []).forEach((row) => {
            if (Array.isArray(row.tags) && row.tags.length) {
                items.push({ type: row.item_type, id: row.item_id, title: row.title || row.item_id, tags: row.tags });
            }
        });
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);
    return items;
}

/**
 * Tags of many items at once (a notebook's list, for sorting and filtering
 * by tag). Never rejects: tags only add to the list, so a failure gives none.
 *
 * @param {string} userName
 * @param {Array<{type: string, id: string}>} items
 * @returns {Promise<Map<string, string[]>>} "<type>#<id>" -> tags (tagged items only)
 */
async function tagsForItems(userName, items) {
    const out = new Map();
    const keys = [...new Set(items.map((i) => itemKey(i.type, i.id)))];
    try {
        for (let i = 0; i < keys.length; i += 100) {
            let request = {
                [TABLE]: {
                    Keys: keys.slice(i, i + 100).map((k) => ({ user_name: userName, item_key: k })),
                    ProjectionExpression: "item_key, tags",
                },
            };
            // DynamoDB may hand back some keys unread when busy; ask again a
            // few times.
            for (let attempt = 0; attempt < 3 && request && Object.keys(request).length; attempt++) {
                const data = await database.dynamoDbClientInstance().batchGet({ RequestItems: request }).promise();
                ((data.Responses && data.Responses[TABLE]) || []).forEach((row) => {
                    if (Array.isArray(row.tags) && row.tags.length) out.set(row.item_key, row.tags);
                });
                request = data.UnprocessedKeys;
            }
        }
    } catch (err) {
        console.log("tagsForItems error:", err.name || err);
    }
    return out;
}

module.exports = { getTags, setTags, listTagged, tagsForItems, itemKey };
