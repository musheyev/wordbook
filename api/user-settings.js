// Per-account preferences, so they follow the user to every device. One row
// per user in `dictionary_user_settings` (PK user_name); each setting is an
// attribute on it:
//   notebook_sort   how My Notebooks is sorted: "az" | "updated" | "custom"
//   item_sorts      how each notebook's items are sorted, by notebook name:
//                   { "Spanish-1": "az", … } (ITEM_SORTS; none = "custom")
//   item_colors     the colour given to a note or word, wherever it appears:
//                   { "card#<id>": "yellow", "word#hola": "blue", … }
//                   (ITEM_COLORS; none = no colour)
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

// A notebook's items: My order (dragged), Newest/Oldest first (added to the
// notebook), A–Z by title, or By tag (A–Z).
const ITEM_SORTS = ['custom', 'newest', 'oldest', 'az', 'tag', 'color'];

/**
 * @param {string} userIdToken
 * @returns {Promise<Object<string, string>>} notebook name -> one of
 *   ITEM_SORTS, for notebooks with a sort chosen; {} if none or unreadable
 */
async function getItemSorts(userIdToken) {
    if (!userIdToken) return {};
    try {
        const userName = await getCurentUserFromToken(userIdToken);
        const data = await db.dynamoDbClientInstance().get({
            TableName: TABLE,
            Key: { user_name: userName },
            ProjectionExpression: 'item_sorts',
        }).promise();
        const sorts = (data.Item && data.Item.item_sorts) || {};
        return Object.fromEntries(Object.entries(sorts).filter(([, v]) => ITEM_SORTS.includes(v)));
    } catch (err) {
        console.log('getItemSorts error:', err.name || err);
        return {};
    }
}

/**
 * Save how one notebook's items are sorted.
 *
 * @param {string} userIdToken
 * @param {string} wordbook notebook name
 * @param {string} sort one of ITEM_SORTS
 * @returns {Promise<string>} the saved sort
 */
async function setItemSort(userIdToken, wordbook, sort) {
    if (!ITEM_SORTS.includes(sort)) throw new Error(`Unknown sort "${sort}"`);
    if (typeof wordbook !== 'string' || !wordbook) throw new Error('No notebook given');
    const userName = await getCurentUserFromToken(userIdToken);
    const client = db.dynamoDbClientInstance();
    const Key = { user_name: userName };
    const setOne = () => client.update({
        TableName: TABLE,
        Key,
        UpdateExpression: 'SET item_sorts.#nb = :sort',
        ExpressionAttributeNames: { '#nb': wordbook },
        ExpressionAttributeValues: { ':sort': sort },
    }).promise();
    try {
        await setOne();
    } catch (err) {
        // The first one: there's no item_sorts map to put it in yet.
        if (err.code !== 'ValidationException' && err.name !== 'ValidationException') throw err;
        await client.update({
            TableName: TABLE,
            Key,
            UpdateExpression: 'SET item_sorts = if_not_exists(item_sorts, :empty)',
            ExpressionAttributeValues: { ':empty': {} },
        }).promise();
        await setOne();
    }
    return sort;
}

// The pale colours a note or word can be given (the app shows them in this
// order, and sorts By colour in it).
const ITEM_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
const itemKey = (type, id) => `${type}#${id}`;

/**
 * @param {string} userIdToken
 * @returns {Promise<Object<string, string>>} "<type>#<id>" -> colour; {} if
 *   none or unreadable (colours never break a page)
 */
async function getItemColors(userIdToken) {
    if (!userIdToken) return {};
    try {
        const userName = await getCurentUserFromToken(userIdToken);
        const data = await db.dynamoDbClientInstance().get({
            TableName: TABLE,
            Key: { user_name: userName },
            ProjectionExpression: 'item_colors',
        }).promise();
        const colors = (data.Item && data.Item.item_colors) || {};
        return Object.fromEntries(Object.entries(colors).filter(([, v]) => ITEM_COLORS.includes(v)));
    } catch (err) {
        console.log('getItemColors error:', err.name || err);
        return {};
    }
}

/**
 * Give notes/words a colour, or take it off (color null).
 *
 * @param {string} userIdToken
 * @param {Array<{type: string, id: string}>} items
 * @param {string|null} color one of ITEM_COLORS, or null for none
 * @returns {Promise<number>} how many items were changed
 */
async function setItemColors(userIdToken, items, color) {
    if (color !== null && !ITEM_COLORS.includes(color)) throw new Error(`Unknown colour "${color}"`);
    const list = (Array.isArray(items) ? items : [])
        .filter((i) => i && (i.type === 'card' || i.type === 'word') && typeof i.id === 'string' && i.id);
    if (!list.length) throw new Error('No items given');
    const userName = await getCurentUserFromToken(userIdToken);
    const client = db.dynamoDbClientInstance();
    const Key = { user_name: userName };
    // A batch of up to 100 per request keeps the update expression small.
    for (let start = 0; start < list.length; start += 100) {
        const batch = list.slice(start, start + 100);
        const names = { '#m': 'item_colors' };
        batch.forEach((item, i) => { names[`#k${i}`] = itemKey(item.type, item.id); });
        const paths = batch.map((_, i) => `#m.#k${i}`);
        const params = color === null
            ? { TableName: TABLE, Key, UpdateExpression: `REMOVE ${paths.join(', ')}`, ExpressionAttributeNames: names }
            : {
                TableName: TABLE, Key,
                UpdateExpression: `SET ${paths.map((p) => `${p} = :c`).join(', ')}`,
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: { ':c': color },
            };
        try {
            await client.update(params).promise();
        } catch (err) {
            if (err.code !== 'ValidationException' && err.name !== 'ValidationException') throw err;
            // No colours yet: nothing to remove, or no map to set into.
            if (color === null) continue;
            await client.update({
                TableName: TABLE, Key,
                UpdateExpression: 'SET item_colors = if_not_exists(item_colors, :empty)',
                ExpressionAttributeValues: { ':empty': {} },
            }).promise();
            await client.update(params).promise();
        }
    }
    return list.length;
}

module.exports = {
    getNotebookSort, setNotebookSort, NOTEBOOK_SORTS, getItemSorts, setItemSort, ITEM_SORTS,
    getItemColors, setItemColors, ITEM_COLORS, TABLE,
};
