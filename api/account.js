/**
 * Deleting an account: everything stored for a user, then their login.
 *
 * Apple requires apps that let people sign up to also let them delete their
 * account from inside the app (App Store Review Guideline 5.1.1(v)). The
 * website offers the same (authRouter's POST /auth/delete-account calls this).
 *
 * What goes:
 *   - Every row the user owns in DynamoDB: notebooks and their items, notes,
 *     word notes, tags, search history, source votes, settings (sorts and
 *     colours), their own word pictures list, their inbox, email history.
 *     These tables all use the user name as their "partition key" (the HASH
 *     key), so one Query per table finds every row of that user.
 *   - Their read-aloud audio references (dictionary_tts_refs). That table is
 *     keyed by item first, so it's scanned for the user's rows instead.
 *   - Their Cognito user (the login itself), last.
 *
 * Files in S3 (note images, audio) aren't deleted one by one here: once no
 * note refers to them they're removed by the existing admin clean-up tools
 * (image-gc.js, tts-gc.js), which is also what keeps copies of notes someone
 * shared with another user working for that user.
 */
const log = require("./logger");
const database = require("./dynamoDb");
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || "us-east-1";
const POOL_ID = process.env.COGNITO_USER_POOL_ID || "us-east-1_zFsf56WQR";
const cognito = new CognitoIdentityProviderClient({ region: REGION });

/** Tables keyed by user name, with their full key (needed to delete a row). */
const USER_TABLES = [
    ["dictionary_wordbook", ["user_name", "wordbook_name"]],
    ["dictionary_wordbooks_words", ["user_name", "wordbook_name"]],
    ["dictionary_cards", ["user_name", "card_id"]],
    ["dictionary_word_notes", ["user_name", "word"]],
    ["dictionary_item_tags", ["user_name", "item_key"]],
    ["dictionary_user_word_history", ["user_name", "search_datetime"]],
    ["dictionary_word_source_votes", ["user_name", "word"]],
    ["dictionary_user_settings", ["user_name"]],
    ["dictionary_user_word_images", ["user_name", "word"]],
    ["dictionary_inbox", ["user_name", "inbox_id"]],
    ["dictionary_email_history", ["user_name", "word"]],
    ["dictionary_unsubscribed", ["user_name", "word"]],
];
const TTS_REFS_TABLE = "dictionary_tts_refs";

const db = () => database.dynamoDbClientInstance();

/**
 * Names for a projection or filter. Some key names ("word") are DynamoDB
 * reserved words, so every name goes through a "#placeholder".
 */
const namesFor = (keys) => Object.fromEntries(keys.map((k, i) => [`#k${i}`, k]));

/**
 * Delete rows in groups of 25 (DynamoDB's BatchWriteItem limit), sending
 * again whatever DynamoDB didn't get to ("UnprocessedItems", e.g. when busy).
 *
 * @param {string} table
 * @param {object[]} keys each row's full key
 */
async function deleteKeys(table, keys) {
    for (let i = 0; i < keys.length; i += 25) {
        let requests = { [table]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) };
        for (let attempt = 0; requests && Object.keys(requests).length && attempt < 5; attempt++) {
            const res = await db().batchWrite({ RequestItems: requests }).promise();
            requests = res.UnprocessedItems;
            if (requests && Object.keys(requests).length) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
    }
}

/** Every key of `userName`'s rows in a user-keyed table (all pages). */
async function userKeys(table, keyNames, userName) {
    const keys = [];
    let start;
    do {
        const res = await db().query({
            TableName: table,
            KeyConditionExpression: "#k0 = :u",
            ExpressionAttributeNames: namesFor(keyNames),
            ExpressionAttributeValues: { ":u": userName },
            ProjectionExpression: keyNames.map((_, i) => `#k${i}`).join(", "),
            ExclusiveStartKey: start,
        }).promise();
        keys.push(...(res.Items || []));
        start = res.LastEvaluatedKey;
    } while (start);
    return keys;
}

/** Every key of `userName`'s rows in the read-aloud references table. */
async function ttsRefKeys(userName) {
    const keys = [];
    let start;
    do {
        const res = await db().scan({
            TableName: TTS_REFS_TABLE,
            FilterExpression: "#u = :u",
            ExpressionAttributeNames: { "#i": "item_key", "#u": "user_name" },
            ExpressionAttributeValues: { ":u": userName },
            ProjectionExpression: "#i, #u",
            ExclusiveStartKey: start,
        }).promise();
        keys.push(...(res.Items || []));
        start = res.LastEvaluatedKey;
    } while (start);
    return keys;
}

/**
 * Delete everything stored for a user, then their Cognito login.
 *
 * @param {string} userName the Cognito user name (the token's cognito:username)
 * @returns {Promise<{[table: string]: number}>} rows deleted per table
 * @throws if a table or Cognito fails; it's safe to call again (what's
 *   already gone is simply not found the second time)
 */
async function deleteAccount(userName) {
    if (!userName) throw new Error("No user name");
    const deleted = {};
    for (const [table, keyNames] of USER_TABLES) {
        const keys = await userKeys(table, keyNames, userName);
        await deleteKeys(table, keys);
        deleted[table] = keys.length;
    }
    const refs = await ttsRefKeys(userName);
    await deleteKeys(TTS_REFS_TABLE, refs);
    deleted[TTS_REFS_TABLE] = refs.length;

    try {
        await cognito.send(new AdminDeleteUserCommand({ UserPoolId: POOL_ID, Username: userName }));
    } catch (err) {
        if (err.name !== "UserNotFoundException") throw err; // already gone: fine
    }
    log(`Deleted account ${userName}: ${JSON.stringify(deleted)}`);
    return deleted;
}

module.exports = { deleteAccount, USER_TABLES };
