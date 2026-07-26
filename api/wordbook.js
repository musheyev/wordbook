const getCurentUserFromToken = require('./auth').getCurentUserFromToken;
const database = require('./dynamoDb');

// NOTE: https://docs.amazonaws.cn/en_us/sdk-for-javascript/v2/developer-guide/dynamodb-example-document-client.html
/*
https://stackoverflow.com/questions/36441987/dynamodb-putitem-conditionexpression-boolean-true
ConditionExpression: "#yr <> :yyyy and title <> :t",
ExpressionAttributeNames:{"#yr":"year"},
ExpressionAttributeValues:{
    ":yyyy":year,
    ":t":title
}
*/


function addWordbook(userIdToken, wordbookName, returnListWithPreview = false) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken).then(userName => {
            var params = {
                TableName: "dictionary_wordbook",
                ConditionExpression: "attribute_not_exists(wordbook_name)",

                // ConditionExpression: '!(user_name = :username AND wordbook_name = :wordbookname)',
                // ExpressionAttributeValues: {
                //     ":username": userName,
                //     ":wordbookname": wordbookName
                // },
                Item: {
                    wordbook_name: wordbookName,
                    user_name: userName,
                    added_datetime: (new Date()).toISOString(),
                }
            };

            database.dynamoDbClientInstance().put(params, (err, data) => {

                //console.log(`data=${JSON.stringify(data,2)}`);
                //console.log(`err=${err}`);
                if (err) {
                    reject(err);
                }
                else {
                    //data will be a blank object
                    console.log(`list wordbooks.  returnListWithPreview=${returnListWithPreview}`);

                    let promiseListWordbooks;

                    if (!returnListWithPreview) {
                        promiseListWordbooks = _listWordbooks(userName);
                    } else {
                        promiseListWordbooks = _listWordbooksWithWords(userName);
                    }

                    promiseListWordbooks
                        .then(workbooks => {
                            console.log(JSON.stringify(workbooks, 2));
                            resolve(workbooks);
                        })
                        .catch(err => {
                            console.log("error from promiseListWordbooks");
                            console.log(err);
                            resolve([]);
                        });
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

function deleteWordbook(userIdToken, wordbookName, needWordbookList = true, returnListWithPreview = false) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken)
            .then(userName => {
                return _deleteWordbook(userName, wordbookName, needWordbookList, returnListWithPreview);
            })
            .then(data => resolve(data))
            .catch(err => reject(err));

    });
};

function _deleteWordbook(userName, wordbookName, needWordbookList, returnListWithPreview) {
    return new Promise((resolve, reject) => {

        let deleteWordbookWordsPromise = _deleteAllWordsInWordbook(userName, wordbookName);

        let params = {
            TableName: "dictionary_wordbook",
            Key: {
                wordbook_name: wordbookName,
                user_name: userName
            }
        };

        let deleteWordbookRecordPromise = database.dynamoDbClientInstance().delete(params).promise();

        Promise.all([deleteWordbookWordsPromise, deleteWordbookRecordPromise])
            .then(_ => {
                if (needWordbookList) {

                    let promiseListWordbooks;

                    if (!returnListWithPreview) {
                        promiseListWordbooks = _listWordbooks(userName);
                    } else {
                        promiseListWordbooks = _listWordbooksWithWords(userName);
                    }

                    promiseListWordbooks
                        .then(workbooks => {
                            //console.log(JSON.stringify(workbooks, 2));
                            resolve(workbooks);
                        })
                        .catch(_ => resolve([]));
                } else {
                    resolve("Done");
                }
            })
            .catch(err => {
                console.log(`Error in _deleteWordbook.  ${err}`);
                reject(err);
            });
    });
}

function _deleteAllWordsInWordbook(userName, wordbookName) {
    return new Promise((resolve, reject) => {
        var params = {
            TableName: "dictionary_wordbooks_words",
            KeyConditionExpression: `user_name = :userName and begins_with(wordbook_name, :wordbook)`,
            ExpressionAttributeValues: {
                ":userName": userName,
                ":wordbook": wordbookName + "#"
            },
            ProjectionExpression: "wordbook_name",

        };

        let dbQueryPromise = database.dynamoDbClientInstance().query(params).promise();

        dbQueryPromise
            .then(dataFromDb => {
                //console.log(dataFromDb);
                //console.log("==========");

                // Break result into chunks
                // https://stackoverflow.com/questions/8495687/split-array-into-chunks/37826698#37826698

                //TODO: handle use case when there are fewer than 11 words more efficiently...
                var perChunk = 10 // items per chunk    

                if (dataFromDb.Items && dataFromDb.Items.length > 0) {
                    var chunks = dataFromDb.Items.reduce((resultArray, item, index) => {
                        const chunkIndex = Math.floor(index / perChunk)

                        if (!resultArray[chunkIndex]) {
                            resultArray[chunkIndex] = [] // start a new chunk
                        }

                        resultArray[chunkIndex].push(item)

                        return resultArray
                    },
                        []);

                    //console.log(chunks); 
                    //console.log("==========");

                    // Create Delete Requests and use DynamoDb batch write
                    // https://stackoverflow.com/questions/49684100/delete-large-data-with-same-partition-key-from-dynamodb/49688771

                    const batchCalls = chunks.map(async (chunk) => {
                        const deleteRequests = chunk.map(item => {
                            return {
                                DeleteRequest: {
                                    Key: {
                                        'user_name': userName,
                                        'wordbook_name': item.wordbook_name,

                                    }
                                }
                            }
                        })

                        //console.log(JSON.stringify(deleteRequests, 2)); 
                        //console.log("==========");

                        const batchWriteParams = {
                            RequestItems: {
                                dictionary_wordbooks_words: deleteRequests
                            }
                        }

                        //console.log(JSON.stringify(batchWriteParams, 2)); 
                        //console.log("==========");

                        await database.dynamoDbClientInstance().batchWrite(batchWriteParams).promise()
                    })

                    Promise.all(batchCalls)
                        .then(_ => resolve())
                        .catch(err => {
                            console.error("Error in _deleteAllWordsInWordbook");
                            reject(err);
                        });
                }

            })
            .catch(err => {
                console.error("Error in _deleteAllWordsInWordbook.  Promise to query dictionary_wordbooks_words failed.");
                reject(err);
            });
    });

}

function listWordbooks(userIdToken) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken)
            .then(userName => {
                _listWordbooks(userName).then(workbooks => {
                    resolve(workbooks);
                })
                    .catch(err => {
                        console.log("error from listWordbooks");
                        console.log(err);
                        resolve([]);
                    });


            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

//NOTE: do not export this function; it does not check user credentials
function _listWordbooks(userName) {
    return new Promise((resolve, reject) => {

        var params = {
            TableName: "dictionary_wordbook",
            KeyConditionExpression: `user_name = :userName`,
            ExpressionAttributeValues: {
                ":userName": userName
            },
            ProjectionExpression: "wordbook_name,sort_order",

        };

        database.dynamoDbClientInstance().query(params, (err, dataFromDb) => {
            if (err)
                reject(err);
            else {

                dataFromDb.Items.sort((e1, e2) => {
                    if (e1.sort_order < e2.sort_order) {
                        return -1;
                    }

                    if (e1.sort_order > e2.sort_order) {
                        return 1;
                    }

                    return 0;
                });

                let data = dataFromDb.Items.map(element => element.wordbook_name);
                resolve(data);
            }

        });

    })
}

function listWordbooksWithWords(userIdToken) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken)
            .then(userName => {
                _listWordbooksWithWords(userName)
                    .then(data => {
                        resolve(data);
                    })
                    .catch(err => {
                        console.log("error from _listWordbooksWithWords");
                        console.log(err);
                        resolve([]);
                    });


            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

function _listWordbooksWithWords(userName, limit = 5) {
    console.log("_listWordbooksWithWords called");
    return new Promise((resolve, reject) => {

        _listWordbooks(userName)
            .then(wordbooks => {
                let promissesToGetWords = [];
                wordbooks.forEach(wordbook => {
                    promissesToGetWords.push(_listOfWords(userName, wordbook, limit));
                });

                let result = Object();
                Promise.all(promissesToGetWords)
                    .then(data => {
                        let i = 0;
                        wordbooks.forEach(wordbook => {
                            result[wordbook] = data[i].join(', ');
                            i++;
                        });

                        resolve(result);
                    })
                    .catch(e => {
                        console.log(`error from _listWordbooksWithWords querying words for user's ${userName} wordbooks`);
                        console.log(e);
                        reject(e);
                    })

            })
            .catch(err => {
                console.log(`error from _listWordbooksWithWords querying wordbooks for user ${userName}`);
                console.log(err);
                reject(err);
            });

    })
}

/*
result[wordbook] = [];
.then(words => result[wordbook] = words)
                        .catch(e => {
                            console.log(`error from _listWordbooksWithWords querying words for ${wordbook}`);
                            console.log(e);
                        });
*/

function addWordToWordbook(userIdToken, wordbookName, word) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        console.log("addWordToWordbook called");
        getCurentUserFromToken(userIdToken).then(userName => {
            var params = {
                TableName: "dictionary_wordbooks_words",
                //ConditionExpression: "attribute_not_exists(word)",

                // ConditionExpression: '!(user_name = :username AND wordbook_name = :wordbookname)',
                // ExpressionAttributeValues: {
                //     ":username": userName,
                //     ":wordbookname": wordbookName
                // },
                Item: {
                    user_name: userName,
                    wordbook_name: wordbookName + "#" + word,
                    word: word,
                    added_datetime: (new Date()).toISOString(),
                }
            };

            database.dynamoDbClientInstance().put(params, (err, data) => {

                console.log(`data=${JSON.stringify(data, 2)}`);
                console.log(`err=${err}`);
                if (err) {
                    reject(err);
                }
                else
                    //data will be a blank object
                    console.log("list of words in a wordbook");
                _listOfWords(userName, wordbookName).then(words => {
                    resolve(words);
                })
                    .catch(err => {
                        console.log("error from listOfWords");
                        console.log(err);
                        resolve([]);
                    });

                //

            });
        })
            //.then(data => resolve(data))
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });

    });
};

function deleteWordFromWordbook(userIdToken, wordbookName, word) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken).then(userName => {
            var params = {
                TableName: "dictionary_wordbooks_words",
                Key: {
                    "user_name": userName,
                    "wordbook_name": wordbookName + "#" + word
                },
                ConditionExpression: "word = :val",
                ExpressionAttributeValues: {
                    ":val": word
                }

            };

            database.dynamoDbClientInstance().delete(params, (err, data) => {

                console.log(`data=${JSON.stringify(data, 2)}`);
                console.log(`err=${err}`);
                if (err) {
                    reject(err);
                }
                else
                    //data will be a blank object
                    console.log("list of words in a wordbook after delete");
                _listOfWords(userName, wordbookName).then(words => {
                    resolve(words);
                })
                    .catch(err => {
                        console.log("error from listOfWords");
                        console.log(err);
                        resolve([]);
                    });

                //

            });
        })
            //.then(data => resolve(data))
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });

    });
};

/// private, list of words in a wordbook
function _listOfWords(userName, wordbookName, limit = 0) {
    return new Promise((resolve, reject) => {

        var params = {
            TableName: "dictionary_wordbooks_words",
            KeyConditionExpression: `user_name = :userName and begins_with(wordbook_name, :wordbook)`,
            ExpressionAttributeValues: {
                ":userName": userName,
                ":wordbook": wordbookName + "#"
            },
            ProjectionExpression: "word,sort_order",

        };

        if (limit > 0) {
            params["Limit"] = limit;
        }

        database.dynamoDbClientInstance().query(params, (err, dataFromDb) => {
            if (err)
                reject(err);
            else {

                dataFromDb.Items.sort((e1, e2) => {
                    if (e1.sort_order < e2.sort_order) {
                        return -1;
                    }

                    if (e1.sort_order > e2.sort_order) {
                        return 1;
                    }

                    return 0;
                });

                let data = dataFromDb.Items.map(element => element.word);

                resolve(data);
            }

        });

    })
}

function listofWords(userIdToken, wordbookName) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken).then(userName => {
            _listOfWords(userName, wordbookName).then(words => {
                resolve(words);
            })
                .catch(err => {
                    console.log("error from listofWords");
                    console.log(err);
                    resolve([]);
                });


        })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

/// private, list of word's wordbooks
function _listOfWordbooksForWord(userName, word) {
    return new Promise((resolve, reject) => {

        console.log(`word=${word}`)
        var params = {
            TableName: "dictionary_wordbooks_words",
            ExpressionAttributeValues: {
                ":userName": userName,
                ":word": word
            },
            KeyConditionExpression: "user_name = :userName",
            FilterExpression: 'contains (word, :word)',
            ProjectionExpression: "wordbook_name",

        };

        database.dynamoDbClientInstance().query(params, (err, dataFromDb) => {
            if (err)
                reject(err);
            else {
                let data = dataFromDb.Items.map(element => {
                    const indexOfDelimiter = element.wordbook_name.indexOf("#");
                    return element.wordbook_name.substring(0, indexOfDelimiter);
                });
                console.log(data)
                resolve(data);
            }

        });

    })
}

function listOfWordbooksForWord(userIdToken, word) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken).then(userName => {
            _listOfWordbooksForWord(userName, word).then(workbooks => {
                resolve(workbooks);
            })
                .catch(err => {
                    console.log("error from _listOfWordbooksForWord");
                    console.log(err);
                    resolve([]);
                });


        })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

function reorder(userIdToken, wordbooks, needWordbookList, returnResultWithPreview) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken)
            .then(userName => {

                _orderWordbooksInDynamoDb(userName, wordbooks)
                    .then(_ => {
                        if (needWordbookList) {
                            let listWordbooksPromise;

                            if (returnResultWithPreview) {
                                listWordbooksPromise = _listWordbooksWithWords(userName);
                            } else {
                                listWordbooksPromise = _listWordbooks(userName);
                            }

                            listWordbooksPromise
                                .then(data => {
                                    resolve(data);
                                })
                                .catch(err => {
                                    console.log("error from listWordbooksPromise");
                                    reject(err);
                                });
                        } else {
                            resolve();
                        }
                    })
                    .catch(errDynamoDb => {
                        console.log("error from _orderWordbooksInDynamoDb");
                        reject(errDynamoDb);
                    });

            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

function _orderWordbooksInDynamoDb(userName, wordbooks) {
    return new Promise((resolve, _) => {
        console.log("called _orderWordbooksInDynamoDb");

        let wordbooksArray = wordbooks.split(",");
        let setWordbookSortOrderPromiseArray = [];

        let sortOrder = 0;
        wordbooksArray.forEach(wordbook => {
            setWordbookSortOrderPromiseArray.push(_setWordbookSortOrder(userName, wordbook, sortOrder));
            sortOrder++;
        });

        if (setWordbookSortOrderPromiseArray.length > 0) {
            Promise.all(setWordbookSortOrderPromiseArray)
                .then(_ => resolve());
        } else {
            resolve();
        }

    })
}

function _setWordbookSortOrder(userName, wordbook, sortOrder) {
    return new Promise((resolve, _) => {
        let params = {
            TableName: "dictionary_wordbook",
            "Key": {
                "user_name": userName,
                "wordbook_name": wordbook,
            },
            "UpdateExpression": "set sort_order = :val1",
            "ExpressionAttributeValues": {
                ":val1": sortOrder,
            },
            "ReturnValues": "NONE"
        };

        database.dynamoDbClientInstance().update(params, function (err, _) {
            if (err) {
                console.error(`Unable to set sort order for ${userName} wordbook: ${wordbook}. Error JSON:`, JSON.stringify(err, null, 2));
            } else {
                console.log(`Set sort order for ${userName} wordbook: ${wordbook}`);
            }
        });

        resolve();
    });
}

function _orderWordbookWordsInDynamoDb(userName, wordbook, words) {
    return new Promise((resolve, _) => {
        console.log("called _orderWordbooksInDynamoDb");

        let wordsArray = words.split(",");
        let setSortOrderPromiseArray = [];

        let sortOrder = 0;
        wordsArray.forEach(word => {
            setSortOrderPromiseArray.push(_setWordbookWordSortOrder(userName, wordbook, word, sortOrder));
            sortOrder++;
        });

        if (setSortOrderPromiseArray.length > 0) {
            Promise.all(setSortOrderPromiseArray)
                .then(_ => resolve());
        } else {
            resolve();
        }

    })
}

function _setWordbookWordSortOrder(userName, wordbook, word, sortOrder) {
    return new Promise((resolve, _) => {
        let params = {
            TableName: "dictionary_wordbooks_words",
            "Key": {
                "user_name": userName,
                "wordbook_name": wordbook + '#' + word,
            },
            "UpdateExpression": "set sort_order = :val1",
            "ExpressionAttributeValues": {
                ":val1": sortOrder,
            },
            "ReturnValues": "NONE"
        };

        database.dynamoDbClientInstance().update(params, function (err, _) {
            if (err) {
                console.error(`Unable to set sort order for ${userName} wordbook: ${wordbook}, word: ${word}. Error JSON:`, JSON.stringify(err, null, 2));
            } else {
                console.log(`Set sort order for ${userName} wordbook: ${wordbook}`);
            }
        });

        resolve();
    });
}

function reorderWords(userIdToken, wordbook, words, needWordList) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken)
            .then(userName => {

                _orderWordbookWordsInDynamoDb(userName, wordbook, words)
                    .then(_ => {
                        if (needWordList) {
                            _listOfWords(userName, wordbook)
                                .then(words => {
                                    resolve(words);
                                })
                                .catch(err => {
                                    console.log("error from _listOfWords");
                                    console.log(err);
                                    resolve([]);
                                });
                        } else {
                            resolve();
                        }
                    })
                    .catch(errDynamoDb => {
                        console.log("error from _orderWordbookWordsInDynamoDb");
                        reject(errDynamoDb);
                    });

            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

/*
TODO:  Rename Wordbook:
1. Reject if new name already exists
2. Create a new record in dictionary_wordbook
3. Create new records in dictionary_wordbooks_words
4. Delete old records in two tables above
5. Return list of wordbooks

*/

function rename(userIdToken, wordbookName, newName) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }
        getCurentUserFromToken(userIdToken)
            .then(userName => {

                _rename(userName, wordbookName, newName)
                    .then(res => resolve(res))
                    .catch(err => reject(err));


            })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error)
            });
    });
}

function _rename(userName, wordbookName, newName) {
    return new Promise((resolve, reject) => {
        //reject if new name already exists
        let paramsCheckIfNewNameExists = {
            TableName: "dictionary_wordbook",
            Key: {
                "user_name": userName,
                "wordbook_name": newName
            }
        };

        database.dynamoDbClientInstance().get(paramsCheckIfNewNameExists).promise()
            .then(data => {

                if (data.Item != undefined) {
                    reject(`${newName} already exists`);
                }

                //get the item with the old wordbook name
                let paramsGetExistingWordbook = {
                    TableName: "dictionary_wordbook",
                    Key: {
                        "user_name": userName,
                        "wordbook_name": wordbookName
                    }
                };

                return database.dynamoDbClientInstance().get(paramsGetExistingWordbook).promise();
            })
            .then(data => {

                let dictionaryWordbookItem = data.Item;

                if (dictionaryWordbookItem == undefined) {
                    reject(`Wordbook ${wordbookName} does not exist`);
                    return;
                }

                //add new record to dictionary_wordbook
                dictionaryWordbookItem.wordbook_name = newName;

                let paramsAddNewItem = {
                    TableName: "dictionary_wordbook",
                    ConditionExpression: "attribute_not_exists(wordbook_name)",

                    Item: dictionaryWordbookItem
                };

                return database.dynamoDbClientInstance().put(paramsAddNewItem).promise();
            })
            .then(_ => {
                let paramsGetWordbookWords = {
                    TableName: "dictionary_wordbooks_words",
                    KeyConditionExpression: `user_name = :userName and begins_with(wordbook_name, :wordbook)`,
                    ExpressionAttributeValues: {
                        ":userName": userName,
                        ":wordbook": wordbookName + "#"
                    },
                    ProjectionExpression: "added_datetime,word,sort_order",

                };

                return database.dynamoDbClientInstance().query(paramsGetWordbookWords).promise();
            })
            .then(data => {
                if (data.Items != undefined) {
                    let databaseUpdatePromises = [];

                    data.Items.map(dataItem => {
                        params = {
                            TableName: "dictionary_wordbooks_words",
                            Item: {
                                user_name: userName,
                                wordbook_name: newName + "#" + dataItem.word,
                                word: dataItem.word,
                                added_datetime: dataItem.added_datetime,
                            }
                        };

                        databaseUpdatePromises.push(database.dynamoDbClientInstance().put(params).promise());

                    });

                    if (databaseUpdatePromises.length > 0) {
                        return Promise.all(databaseUpdatePromises)
                    }
                }

                return Promise.resolve();
            })
            .then(_ => {
                return _deleteWordbook(userName, wordbookName, false, false);
            })
            .then(_ => resolve("Done"))
            .catch(err => reject(err));
    });
}


module.exports = {
    addWordbook,
    deleteWordbook,
    listWordbooks,
    listWordbooksWithWords,
    addWordToWordbook,
    deleteWordFromWordbook,
    listofWords,
    listOfWordbooksForWord,
    reorder,
    reorderWords,
    rename

}