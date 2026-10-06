// App-wide settings that admins change (not per user; for those see
// user-settings.js). One row per setting in `dictionary_app_settings`
// (PK setting_id):
//   image_search   { enabled: boolean }  Brave image search: automatic images
//                  for new words, and admins' "Refresh images". On unless an
//                  admin turns it off.
//
// Reads are cached in memory for CACHE_MS, so a word lookup doesn't add a
// database read; a change made on one server instance reaches the others
// within that time.
const db = require('./dynamoDb');

const TABLE = 'dictionary_app_settings';
const CACHE_MS = 30 * 1000;

let cached = null; // { enabled, at }

/**
 * @returns {Promise<boolean>} true unless an admin turned image search off.
 *   If the setting can't be read, true: the default, as before the switch
 *   existed.
 */
async function isImageSearchEnabled() {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.enabled;
    let enabled = true;
    try {
        const data = await db.dynamoDbClientInstance().get({
            TableName: TABLE,
            Key: { setting_id: 'image_search' },
        }).promise();
        if (data.Item && data.Item.enabled === false) enabled = false;
    } catch (err) {
        console.log('isImageSearchEnabled error:', err.name || err);
    }
    cached = { enabled, at: Date.now() };
    return enabled;
}

/**
 * @param {boolean} enabled
 * @param {string} changedBy admin's username, kept for reference
 * @returns {Promise<boolean>} the saved value
 */
async function setImageSearchEnabled(enabled, changedBy) {
    const value = enabled === true;
    await db.dynamoDbClientInstance().put({
        TableName: TABLE,
        Item: {
            setting_id: 'image_search',
            enabled: value,
            changed_by: changedBy || null,
            changed_at: new Date().toISOString(),
        },
    }).promise();
    cached = { enabled: value, at: Date.now() };
    return value;
}

module.exports = { isImageSearchEnabled, setImageSearchEnabled, TABLE };
