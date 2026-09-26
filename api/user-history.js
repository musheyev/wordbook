const db = require('./dynamoDb');
const getCurentUserFromToken = require('./auth').getCurentUserFromToken;

/// private, list of words in user history
function _listOfWords(userName) {
    return new Promise((resolve, reject) => {

        var params = {
            TableName: "dictionary_user_word_history",
            KeyConditionExpression: `user_name = :userName`,
            ExpressionAttributeValues: {
                ":userName": userName
            },
            ProjectionExpression: "word",

        };

        db.dynamoDbClientInstance().query(params, (err, dataFromDb) => {
            if (err)
                reject(err);
            else {
                // Items come back ordered by search_datetime (oldest -> newest).
                // Walk newest -> oldest and keep each word's first (i.e. most
                // recent) hit, so the result is unique and most-recently-searched
                // first. Re-searching a word thus moves it to the top.
                const words = dataFromDb.Items.map(element => element.word);
                const seen = new Set();
                const ordered = [];
                for (let i = words.length - 1; i >= 0; i--) {
                    const w = words[i];
                    if (!seen.has(w)) {
                        seen.add(w);
                        ordered.push(w);
                    }
                }
                resolve(ordered);
            }

        });
    })
}

function getUserHistory(userIdToken) {

    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then(userName => {
                _listOfWords(userName)
                    .then(words => {
                        resolve(words);
                    })
                    .catch(err => {
                        console.log("error from listOfWords");
                        console.log(err);
                        resolve([]);
                    });
            })
            .catch((error) => reject(error));

    });
}

function saveUserHistoryToDynamoDb(word, userIdToken) {

    if (!userIdToken) {
        return;
    }

    getCurentUserFromToken(userIdToken).then(userName => {

        const dbParameterUserHistory = {
            TableName: "dictionary_user_word_history",
            Item: {
                user_name: userName,
                search_datetime: (new Date()).toISOString(),
                word: word,
            }
        }

        const docClient = db.dynamoDbClientInstance();
        const keepDatetime = dbParameterUserHistory.Item.search_datetime;

        docClient.put(dbParameterUserHistory, function (err, data) {
            if (err) {
                console.error("Unable to add item to DynamoDb.dictionary_user_word_history. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                // Prune older rows for this word so only the latest one remains
                // (keeps the table from growing a new row on every re-search).
                _pruneDuplicateWordRows(userName, word, keepDatetime);
            }
        });
    }).catch();


}

// Delete every row for (userName, word) except the one at keepDatetime, so the
// history holds a single, most-recent row per word. Fire-and-forget.
function _pruneDuplicateWordRows(userName, word, keepDatetime) {
    const docClient = db.dynamoDbClientInstance();

    const params = {
        TableName: "dictionary_user_word_history",
        KeyConditionExpression: "user_name = :userName",
        FilterExpression: "word = :word",
        ExpressionAttributeValues: {
            ":userName": userName,
            ":word": word,
        },
        ProjectionExpression: "search_datetime",
    };

    docClient.query(params, (err, dataFromDb) => {
        if (err) {
            console.log("prune history query error:", err);
            return;
        }
        const items = (dataFromDb && dataFromDb.Items) || [];
        items.forEach((item) => {
            if (item.search_datetime === keepDatetime) {
                return; // keep the row we just wrote
            }
            const delParams = {
                TableName: "dictionary_user_word_history",
                Key: {
                    user_name: userName,
                    search_datetime: item.search_datetime,
                },
            };
            docClient.delete(delParams, (delErr) => {
                if (delErr) console.log("prune history delete error:", delErr);
            });
        });
    });
}

function deleteWordFromHistory(userIdToken, word) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        let nothingToDelete = false;

        getCurentUserFromToken(userIdToken)
            .then(userName => {

                var params = {
                    TableName: "dictionary_user_word_history",
                    KeyConditionExpression: "user_name = :userName",
                    ExpressionAttributeValues: {
                        ":userName": userName,
                    },
                    ProjectionExpression: "search_datetime, word",

                };

                db.dynamoDbClientInstance().query(params, (err, dataFromDb) => {
                    if (err)
                        console.log(err);
                    else {
                        if (dataFromDb.Items && dataFromDb.Items.length > 0) {
                            let filteredData = dataFromDb.Items.filter(item => item.word === word);
                            //console.log(filteredData);

                            if (filteredData.length > 0) {
                                filteredData.forEach(item => {
                                    var paramsToDelete = {
                                        TableName: "dictionary_user_word_history",
                                        Key: {
                                            "user_name": userName,
                                            "search_datetime": item.search_datetime
                                        },
                                        ConditionExpression: "word = :val",
                                        ExpressionAttributeValues: {
                                            ":val": word
                                        }

                                    };

                                    db.dynamoDbClientInstance().delete(paramsToDelete, (err, _) => {

                                        //console.log(`data=${JSON.stringify(data, 2)}`);
                                        console.log(`dynamodb err=${err}`);
                                        if (err) {
                                            reject(err);
                                        }
                                        else {

                                            //console.log("list of words in a wordbook after delete");
                                            _listOfWords(userName)
                                                .then(words => {
                                                    resolve(words);
                                                })
                                                .catch(err => {
                                                    console.log("error from listOfWords");
                                                    console.log(err);
                                                    resolve([]);
                                                });
                                        }

                                    });
                                })
                            } else {
                                console.log("WARNING: requested to delete word not in user history in deleteWordFromHistory call");
                                _listOfWords(userName)
                                    .then(words => {
                                        resolve(words);
                                    })
                                    .catch(err => {
                                        console.log("error from listOfWords");
                                        console.log(err);
                                        resolve([]);
                                    });

                            }

                        } else {
                            console.log("WARNING: user history query returned nothing in deleteWordFromHistory call");
                            _listOfWords(userName)
                                .then(words => {
                                    resolve(words);
                                })
                                .catch(err => {
                                    console.log("error from listOfWords");
                                    console.log(err);
                                    resolve([]);
                                });

                        }
                    }
                });


            })
            //.then(data => resolve(data))
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });

    });
};

module.exports = {
    saveUserHistoryToDynamoDb,
    getUserHistory,
    deleteWordFromHistory

}