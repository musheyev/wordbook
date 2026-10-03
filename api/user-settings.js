// Per-account preferences, so they follow the user to every device. One row
// per user in `dictionary_user_settings` (PK user_name); each setting is an
// attribute on it:
//   notebook_sort   how My Notebooks is sorted: "az" | "updated" | "custom"
const db = require('./dynamoDb');
const getCurentUserFromToken = require('./auth').getCurentUserFromToken;

const TABLE = 'dictionary_user_settings';

const NOTEBOOK_SORTS = ['az', 'updated', 'custom'];
// Until the user picks one: A–Z, which is how the list looked before sorting
// options existed.
const DEFAULT_NOTEBOOK_SORT = 'az';

/**
 * @param {string} userIdToken
 * @returns {Promise<string>} one of NOTEBOOK_SORTS; the default if none is
 *   saved or it can't be read (a sort preference never breaks the page)
 */
async function getNotebookSort(userIdToken) {
    if (!userIdToken) return DEFAULT_NOTEBOOK_SORT;
    try {
        const userName = await getCurentUserFromToken(userIdToken);
        const data = await db.dynamoDbClientInstance().get({
            TableName: TABLE,
            Key: { user_name: userName },
            ProjectionExpression: 'notebook_sort',
        }).promise();
        const sort = data.Item && data.Item.notebook_sort;
        return NOTEBOOK_SORTS.includes(sort) ? sort : DEFAULT_NOTEBOOK_SORT;
    } catch (err) {
        console.log('getNotebookSort error:', err.name || err);
        return DEFAULT_NOTEBOOK_SORT;
    }
}

/**
 * Save how My Notebooks is sorted. An update, not a put, so other settings on
 * the row are kept.
 *
 * @param {string} userIdToken
 * @param {string} sort one of NOTEBOOK_SORTS
 * @returns {Promise<string>} the saved sort
 */
async function setNotebookSort(userIdToken, sort) {
    if (!NOTEBOOK_SORTS.includes(sort)) {
        throw new Error(`Unknown sort "${sort}"`);
    }
    const userName = await getCurentUserFromToken(userIdToken);
    await db.dynamoDbClientInstance().update({
        TableName: TABLE,
        Key: { user_name: userName },
        UpdateExpression: 'SET notebook_sort = :sort',
        ExpressionAttributeValues: { ':sort': sort },
    }).promise();
    return sort;
}

module.exports = { getNotebookSort, setNotebookSort, NOTEBOOK_SORTS, TABLE };
