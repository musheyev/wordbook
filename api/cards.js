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

const CARDS_TABLE = "dictionary_cards";

function createCard(userIdToken, title, content) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then((userName) => {
                const cardId = crypto.randomUUID();
                const now = new Date().toISOString();

                const params = {
                    TableName: CARDS_TABLE,
                    Item: {
                        user_name: userName,
                        card_id: cardId,
                        title: title || "",
                        content: content || "",
                        added_datetime: now,
                        updated_datetime: now,
                    },
                };

                database
                    .dynamoDbClientInstance()
                    .put(params)
                    .promise()
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
                    ReturnValues: "NONE",
                };

                database
                    .dynamoDbClientInstance()
                    .update(params)
                    .promise()
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

                        const cardDelete = database
                            .dynamoDbClientInstance()
                            .delete({
                                TableName: CARDS_TABLE,
                                Key: { user_name: userName, card_id: cardId },
                            })
                            .promise();

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

// Given a set of card ids, return { card_id: title }. Used by wordbook.js to
// resolve titles for the chip list without denormalizing them onto membership
// rows. Not user-facing (no token check) — callers already resolved userName.
function _getCardTitles(userName, cardIds) {
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
                    ProjectionExpression: "card_id, #title",
                    ExpressionAttributeNames: { "#title": "title" },
                })
                .promise()
                .then((data) => (data.Item ? data.Item : null))
                .catch(() => null)
        );

        Promise.all(gets).then((items) => {
            const map = {};
            items.forEach((item) => {
                if (item) {
                    map[item.card_id] = item.title || "";
                }
            });
            resolve(map);
        });
    });
}

module.exports = {
    createCard,
    updateCard,
    getCard,
    listCards,
    deleteCard,
    _getCardTitles,
};
