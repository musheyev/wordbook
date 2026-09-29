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

module.exports = { getTags, setTags, listTagged };
