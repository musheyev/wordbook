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
                let data = dataFromDb.Items.map(element => element.word);
                data = [...new Set(data)];
                resolve(data);
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

        docClient.put(dbParameterUserHistory, function (err, data) {
            if (err) {
                console.error("Unable to add item to DynamoDb.dictionary_user_word_history. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                //console.log("Added item:", JSON.stringify(dbParameter, null, 2));
            }
        });
    }).catch();


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