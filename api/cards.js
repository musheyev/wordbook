// Manual "cards": user-authored rich-text entries that behave like dictionary
// words but whose content lives in DynamoDB (table `dictionary_cards`) instead
// of being fetched from Wordnik/Google.
//
// A card is stored ONCE (single source of truth) and referenced from any number
// of wordbooks via membership rows in `dictionary_wordbooks_words` (see
// wordbook.js: addCardToWordbook / _listOfWords). Editing a card therefore
// updates it in every wordbook at once.
//
// Table shape:
//   dictionary_cards: PK user_name, SK card_id
//   attrs: title, content (sanitized HTML), added_datetime, updated_datetime
const crypto = require("crypto");
const getCurentUserFromToken = require("./auth").getCurentUserFromToken;
const database = require("./dynamoDb");
const versions = require("./card-versions");

const CARDS_TABLE = "dictionary_cards";

function createCard(userIdToken, title, content) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then((userName) => _createCardForUser(userName, title, content))
            .then((card) => resolve(card))
            .catch((error) => reject(error));
    });
}

/**
 * Write a new card owned by `userName`. The shared core of creating a card:
 * createCard uses it for the signed-in user, and inbox.js uses it to give a
 * recipient their own copy of a shared note.
 *
 * Not user-facing (no token check): callers must already know who the owner
 * is from a verified token.
 *
 * @param {string} userName owner of the new card
 * @param {string} title
 * @param {string} content sanitized HTML body
 * @param {object} [extra] additional attributes to store, e.g.
 *   { shared_by, shared_at } for a note that came from someone's share
 * @returns {Promise<{card_id: string, title: string, content: string}>}
 */
async function _createCardForUser(userName, title, content, extra = {}) {
    const cardId = crypto.randomUUID();
    const now = new Date().toISOString();

    await database
        .dynamoDbClientInstance()
        .put({
            TableName: CARDS_TABLE,
            Item: {
                ...extra,
                user_name: userName,
                card_id: cardId,
                title: title || "",
                content: content || "",
                added_datetime: now,
                updated_datetime: now,
            },
        })
        .promise();

    return { card_id: cardId, title: title || "", content: content || "" };
}

function updateCard(userIdToken, cardId, title, content) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then((userName) => {
                const params = {
                    TableName: CARDS_TABLE,
                    Key: { user_name: userName, card_id: cardId },
                    ConditionExpression: "attribute_exists(card_id)",
                    // Alias attribute names so a reserved word (e.g. a future
                    // rename) can never break the expression.
                    UpdateExpression:
                        "set #title = :title, #content = :content, #updated = :now",
                    ExpressionAttributeNames: {
                        "#title": "title",
                        "#content": "content",
                        "#updated": "updated_datetime",
                    },
                    ExpressionAttributeValues: {
                        ":title": title || "",
                        ":content": content || "",
                        ":now": new Date().toISOString(),
                    },
                    // The note as it was, so the version it replaces goes
                    // into its history (card-versions.js).
                    ReturnValues: "ALL_OLD",
                };

                database
                    .dynamoDbClientInstance()
                    .update(params)
                    .promise()
                    .then((data) => versions.keepVersionSafely(userName, data.Attributes,
                        { title, content }, "edit"))
                    .then(() =>
                        resolve({ card_id: cardId, title: title || "", content: content || "" })
                    )
                    .catch((err) => reject(err));
            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error);
            });
    });
}

function getCard(userIdToken, cardId) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then((userName) => {
                const params = {
                    TableName: CARDS_TABLE,
                    Key: { user_name: userName, card_id: cardId },
                };

                database
                    .dynamoDbClientInstance()
                    .get(params)
                    .promise()
                    .then((data) => {
                        if (!data.Item) {
                            return reject(new Error("Card not found"));
                        }
                        resolve({
                            card_id: data.Item.card_id,
                            title: data.Item.title || "",
                            content: data.Item.content || "",
                            // When it was last saved: the iPhone app compares
                            // it with its offline edits, so the latest change
                            // wins (web/src/client/offline/outbox.js).
                            updated_datetime: data.Item.updated_datetime || null,
                        });
                    })
                    .catch((err) => reject(err));
            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error);
            });
    });
}

/**
 * Read one card owned by `userName`, or null if that user has no such card.
 * Used by inbox.js to load the note being shared — only from the *sender's*
 * own cards, so nobody can share a note they don't own.
 *
 * Not user-facing (no token check), like _createCardForUser.
 *
 * @param {string} userName
 * @param {string} cardId
 * @returns {Promise<{card_id: string, title: string, content: string}|null>}
 */
async function _getCardForUser(userName, cardId) {
    const data = await database
        .dynamoDbClientInstance()
        .get({ TableName: CARDS_TABLE, Key: { user_name: userName, card_id: cardId } })
        .promise();
    if (!data.Item) {
        return null;
    }
    return { card_id: data.Item.card_id, title: data.Item.title || "", content: data.Item.content || "" };
}

function listCards(userIdToken) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then((userName) => {
                const params = {
                    TableName: CARDS_TABLE,
                    KeyConditionExpression: "user_name = :userName",
                    ExpressionAttributeValues: { ":userName": userName },
                    ProjectionExpression: "card_id, #title, updated_datetime",
                    ExpressionAttributeNames: { "#title": "title" },
                };

                database
                    .dynamoDbClientInstance()
                    .query(params)
                    .promise()
                    .then((data) => resolve(data.Items || []))
                    .catch((err) => reject(err));
            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error);
            });
    });
}

// Delete a card everywhere: remove the card row itself AND every wordbook
// membership row that references it.
function deleteCard(userIdToken, cardId) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then((userName) => {
                // 1. find every membership row for this card_id
                const findParams = {
                    TableName: "dictionary_wordbooks_words",
                    KeyConditionExpression: "user_name = :userName",
                    FilterExpression: "card_id = :cardId",
                    ExpressionAttributeValues: {
                        ":userName": userName,
                        ":cardId": cardId,
                    },
                    ProjectionExpression: "wordbook_name",
                };

                database
                    .dynamoDbClientInstance()
                    .query(findParams)
                    .promise()
                    .then((data) => {
                        const membershipDeletes = (data.Items || []).map((item) =>
                            database
                                .dynamoDbClientInstance()
                                .delete({
                                    TableName: "dictionary_wordbooks_words",
                                    Key: {
                                        user_name: userName,
                                        wordbook_name: item.wordbook_name,
                                    },
                                })
                                .promise()
                        );

                        // Its last version stays in its history for 30 days
                        // (card-versions.js), so a deleted note could come back.
                        const cardDelete = database
                            .dynamoDbClientInstance()
                            .delete({
                                TableName: CARDS_TABLE,
                                Key: { user_name: userName, card_id: cardId },
                                ReturnValues: "ALL_OLD",
                            })
                            .promise()
                            .then((deleted) => versions.keepVersionSafely(userName, deleted.Attributes, null, "deleted"));

                        return Promise.all([...membershipDeletes, cardDelete]);
                    })
                    .then(() => resolve("Done"))
                    .catch((err) => reject(err));
            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error);
            });
    });
}

const PREVIEW_LENGTH = 120;

// Plain-text start of a card's HTML body, for the one-line preview in lists.
function _previewText(html) {
    const text = (html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > PREVIEW_LENGTH ? text.substring(0, PREVIEW_LENGTH) + "…" : text;
}

// Given a set of card ids, return { card_id: { title, preview } }. Used by
// wordbook.js to resolve titles and previews for item lists without
// denormalizing them onto membership rows. Not user-facing (no token check) —
// callers already resolved userName.
function _getCardSummaries(userName, cardIds) {
    return new Promise((resolve) => {
        const unique = [...new Set(cardIds)];
        if (unique.length === 0) {
            return resolve({});
        }

        const gets = unique.map((cardId) =>
            database
                .dynamoDbClientInstance()
                .get({
                    TableName: CARDS_TABLE,
                    Key: { user_name: userName, card_id: cardId },
                    ProjectionExpression: "card_id, #title, #content",
                    ExpressionAttributeNames: { "#title": "title", "#content": "content" },
                })
                .promise()
                .then((data) => (data.Item ? data.Item : null))
                .catch(() => null)
        );

        Promise.all(gets).then((items) => {
            const map = {};
            items.forEach((item) => {
                if (item) {
                    map[item.card_id] = {
                        title: item.title || "",
                        preview: _previewText(item.content),
                    };
                }
            });
            resolve(map);
        });
    });
}

/**
 * Bring a note back to one of its earlier versions (the History window).
 * The note as it is now is kept as a version first ("restore"), and the
 * restore is refused if that can't be done, so restoring never loses
 * anything: restoring the version it kept puts the note back (Undo).
 *
 * @param {string} userIdToken
 * @param {string} cardId
 * @param {string} versionKey from listVersions
 * @returns {Promise<{card: {card_id, title, content}, before: string|null}>}
 *   the note as restored, and the key of the version kept from before it
 */
async function restoreCardVersion(userIdToken, cardId, versionKey) {
    return restoreVersionFor(await getCurentUserFromToken(userIdToken), cardId, versionKey);
}

/** restoreCardVersion for a user name (also used by the history test). */
async function restoreVersionFor(userName, cardId, versionKey) {
    const version = await versions.getVersion(userName, cardId, versionKey);
    if (!version) {
        const err = new Error("That version isn't there any more.");
        err.status = 404;
        throw err;
    }
    const db = database.dynamoDbClientInstance();
    const current = (await db.get({ TableName: CARDS_TABLE, Key: { user_name: userName, card_id: cardId } }).promise()).Item;
    if (!current) {
        const err = new Error("This note isn't there any more.");
        err.status = 404;
        throw err;
    }
    // Kept first; if this fails the restore stops here, before any change.
    const before = await versions.keepVersion(userName, current,
        { title: version.title, content: version.content }, "restore");
    await db.update({
        TableName: CARDS_TABLE,
        Key: { user_name: userName, card_id: cardId },
        ConditionExpression: "attribute_exists(card_id)",
        UpdateExpression: "set #title = :title, #content = :content, #updated = :now",
        ExpressionAttributeNames: { "#title": "title", "#content": "content", "#updated": "updated_datetime" },
        ExpressionAttributeValues: { ":title": version.title, ":content": version.content, ":now": new Date().toISOString() },
    }).promise();
    return { card: { card_id: cardId, title: version.title, content: version.content }, before };
}

module.exports = {
    createCard,
    updateCard,
    restoreCardVersion,
    restoreVersionFor,
    getCard,
    listCards,
    deleteCard,
    _getCardSummaries,
    _createCardForUser,
    _getCardForUser,
    _previewText,
};
