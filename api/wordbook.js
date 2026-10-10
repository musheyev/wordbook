const getCurentUserFromToken = require('./auth').getCurentUserFromToken;
const database = require('./dynamoDb');
const cards = require('./cards');
const tags = require('./tags');

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

        try {
            wordbookName = _validateWordbookName(wordbookName);
        } catch (err) {
            return reject(err);
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
                } else {
                    // Empty wordbook: nothing to delete (previously never settled,
                    // so deleting or renaming an empty wordbook hung the request).
                    resolve();
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
/**
 * A user's notebook rows in their own order ("My order" on My Notebooks):
 * by `sort_order`, which a drag saves; notebooks without one (created since
 * the last drag, or never dragged) come after, in the table's order.
 *
 * @param {string} userName
 * @returns {Promise<Array<{wordbook_name: string, sort_order?: number,
 *   added_datetime?: string, updated_datetime?: string}>>}
 */
async function _queryWordbooks(userName) {
    const data = await database.dynamoDbClientInstance().query({
        TableName: "dictionary_wordbook",
        KeyConditionExpression: "user_name = :userName",
        ExpressionAttributeValues: { ":userName": userName },
        ProjectionExpression: "wordbook_name, sort_order, added_datetime, updated_datetime",
    }).promise();

    const hasOrder = (row) => typeof row.sort_order === "number";
    // Array.prototype.sort is stable, so rows without a sort_order keep the
    // table's order among themselves.
    return data.Items.sort((a, b) => {
        if (hasOrder(a) && hasOrder(b)) return a.sort_order - b.sort_order;
        if (hasOrder(a) !== hasOrder(b)) return hasOrder(a) ? -1 : 1;
        return 0;
    });
}

function _listWordbooks(userName) {
    return _queryWordbooks(userName).then(rows => rows.map(row => row.wordbook_name));
}

/**
 * Notebook names with when each was last updated, for sorting My Notebooks.
 * "Updated" means a note was added to it or a note in it was edited (see
 * _touchWordbook); a notebook that never had either uses when it was created.
 *
 * @param {string} userIdToken
 * @returns {Promise<Array<{name: string, updated: string|null}>>} in "My order"
 */
async function listWordbooksMeta(userIdToken) {
    if (!userIdToken) return [];
    const userName = await getCurentUserFromToken(userIdToken);
    const rows = await _queryWordbooks(userName);
    return rows.map(row => ({
        name: row.wordbook_name,
        updated: row.updated_datetime || row.added_datetime || null,
    }));
}

/**
 * Record that a notebook was updated now. Called when a note is added to it
 * or a note in it is edited — nothing else counts (removing items, renaming,
 * reordering don't).
 *
 * Never rejects: this only feeds the "Recently updated" sort, so a failure is
 * logged rather than failing the save that triggered it. The condition stops
 * it from creating a row for a notebook that no longer exists.
 *
 * @param {string} userName
 * @param {string} wordbookName
 * @returns {Promise<void>}
 */
async function _touchWordbook(userName, wordbookName) {
    try {
        await database.dynamoDbClientInstance().update({
            TableName: "dictionary_wordbook",
            Key: { user_name: userName, wordbook_name: wordbookName },
            ConditionExpression: "attribute_exists(wordbook_name)",
            UpdateExpression: "SET updated_datetime = :now",
            ExpressionAttributeValues: { ":now": new Date().toISOString() },
        }).promise();
    } catch (err) {
        if (err.name !== "ConditionalCheckFailedException") {
            console.log(`Couldn't mark notebook "${wordbookName}" updated: ${err.name}`);
        }
    }
}

/**
 * A note was edited: mark every notebook it's in as updated.
 *
 * @param {string} userIdToken
 * @param {string} cardId
 * @returns {Promise<void>}
 */
async function touchWordbooksForCard(userIdToken, cardId) {
    if (!userIdToken || !cardId) return;
    const userName = await getCurentUserFromToken(userIdToken);
    const wordbooks = await _listOfWordbooksForWord(userName, cardId);
    await Promise.all(wordbooks.map(name => _touchWordbook(userName, name)));
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
                            // data[i] is now a list of typed items ({type,id,title});
                            // the preview is just the titles joined.
                            result[wordbook] = data[i].map(item => item.title).join(', ');
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

/**
 * Sort comparator for a wordbook's items: the order the user arranged them in.
 *
 * Items the user has placed have a numeric `sort_order` (0, 1, 2, … from the
 * last drag-to-reorder) and come first, in that order. Items without one —
 * everything from before reordering existed, and anything added since the
 * last reorder — come after, oldest first by `added_datetime`, so a newly
 * added item appears at the end of the list.
 *
 * (The old comparator compared `undefined` with numbers. Every such
 * comparison is false in JavaScript, so it returned 0 — "equal" — and
 * unordered items ended up wherever the sort happened to leave them.)
 *
 * A comparator returns a negative number to put `a` first, positive to put
 * `b` first, and 0 to keep their current order.
 */
function compareItemOrder(a, b) {
    const aPlaced = typeof a.sort_order === "number";
    const bPlaced = typeof b.sort_order === "number";
    if (aPlaced && bPlaced) return a.sort_order - b.sort_order;
    if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
    return String(a.added_datetime || "").localeCompare(String(b.added_datetime || ""));
}

/// private, list of items (words and cards) in a wordbook.
/// Returns typed objects so the UI can tell words and cards apart:
///   word -> { type: "word", id: <word>,    title: <word> }
///   card -> { type: "card", id: <card_id>, title: <card title>, preview: <text> }
/// Card titles/previews are resolved from the dictionary_cards table (single
/// source of truth) rather than denormalized onto the membership row, so editing
/// a card updates it in every wordbook.
function _listOfWords(userName, wordbookName, limit = 0) {
    return new Promise((resolve, reject) => {

        var params = {
            TableName: "dictionary_wordbooks_words",
            KeyConditionExpression: `user_name = :userName and begins_with(wordbook_name, :wordbook)`,
            ExpressionAttributeValues: {
                ":userName": userName,
                ":wordbook": wordbookName + "#"
            },
            ProjectionExpression: "word, sort_order, item_type, card_id, added_datetime",

        };

        if (limit > 0) {
            params["Limit"] = limit;
        }

        database.dynamoDbClientInstance().query(params, (err, dataFromDb) => {
            if (err)
                return reject(err);

            const items = dataFromDb.Items || [];

            items.sort(compareItemOrder);

            const cardIds = items
                .filter(item => item.item_type === "card")
                .map(item => item.card_id);

            // Each item also carries when it was added to the notebook
            // (`added`, for Newest/Oldest first) and its tags (for By tag
            // and the tag filter); see NotebookOverview.
            const keys = items.map(item => (item.item_type === "card"
                ? { type: "card", id: item.card_id } : { type: "word", id: item.word }));
            Promise.all([cards._getCardSummaries(userName, cardIds), tags.tagsForItems(userName, keys)])
                .then(([summaries, tagMap]) => {
                    const data = items.map((item, i) => {
                        const extra = {
                            added: item.added_datetime || null,
                            tags: tagMap.get(tags.itemKey(keys[i].type, keys[i].id)) || [],
                        };
                        if (item.item_type === "card") {
                            const summary = summaries[item.card_id] || {};
                            return {
                                type: "card",
                                id: item.card_id,
                                title: summary.title ? summary.title : "(untitled card)",
                                preview: summary.preview || "",
                                ...extra,
                            };
                        }

                        return { type: "word", id: item.word, title: item.word, ...extra };
                    });

                    resolve(data);
                })
                .catch(err => reject(err));
        });

    })
}

/// Add a card (by id) to a wordbook. Membership row mirrors a word row but is
/// tagged item_type="card"; `word` is set to the card_id so the existing
/// delete/reorder paths (which key on wordbook#word) work unchanged.
function addCardToWordbook(userIdToken, wordbookName, cardId) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken).then(userName => {
            var params = {
                TableName: "dictionary_wordbooks_words",
                Item: {
                    user_name: userName,
                    wordbook_name: wordbookName + "#" + cardId,
                    word: cardId,
                    item_type: "card",
                    card_id: cardId,
                    added_datetime: (new Date()).toISOString(),
                }
            };

            database.dynamoDbClientInstance().put(params, (err) => {
                if (err) {
                    return reject(err);
                }
                _touchWordbook(userName, wordbookName)
                    .then(() => _listOfWords(userName, wordbookName))
                    .then(words => resolve(words))
                    .catch(_ => resolve([]));
            });
        })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error);
            });
    });
}

/**
 * Does `userName` have a wordbook with this exact name?
 * Not user-facing (no token check).
 *
 * @param {string} userName
 * @param {string} wordbookName
 * @returns {Promise<boolean>}
 */
async function _wordbookExists(userName, wordbookName) {
    if (typeof wordbookName !== "string" || wordbookName === "") {
        return false;
    }
    const data = await database.dynamoDbClientInstance().get({
        TableName: "dictionary_wordbook",
        Key: { user_name: userName, wordbook_name: wordbookName }
    }).promise();
    return Boolean(data.Item);
}

/**
 * Put an item (word or card) into one of `userName`'s wordbooks, after
 * checking that wordbook exists. Used by inbox.js when a recipient moves a
 * shared item into a notebook.
 *
 * Writes the same membership row shape as addWordToWordbook /
 * addCardToWordbook, so the item behaves exactly like one added by hand.
 * Not user-facing (no token check): the caller already resolved userName.
 *
 * @param {string} userName
 * @param {string} wordbookName
 * @param {{type: "word"|"card", id: string}} item a word's text, or a card_id
 * @returns {Promise<boolean>} false if the wordbook doesn't exist (nothing written)
 */
async function _addItemForUser(userName, wordbookName, item) {
    const db = database.dynamoDbClientInstance();

    if (!await _wordbookExists(userName, wordbookName)) {
        return false;
    }

    const row = {
        user_name: userName,
        wordbook_name: wordbookName + "#" + item.id,
        word: item.id,
        added_datetime: (new Date()).toISOString(),
    };
    if (item.type === "card") {
        row.item_type = "card";
        row.card_id = item.id;
    }

    await db.put({ TableName: "dictionary_wordbooks_words", Item: row }).promise();
    if (item.type === "card") {
        await _touchWordbook(userName, wordbookName);
    }
    return true;
}

/// Remove a card from a single wordbook (deletes only the membership row; the
/// card itself and its other memberships are untouched).
function removeCardFromWordbook(userIdToken, wordbookName, cardId) {
    return new Promise((resolve, reject) => {
        if (!userIdToken) {
            return resolve("");
        }

        getCurentUserFromToken(userIdToken).then(userName => {
            var params = {
                TableName: "dictionary_wordbooks_words",
                Key: {
                    user_name: userName,
                    wordbook_name: wordbookName + "#" + cardId,
                }
            };

            database.dynamoDbClientInstance().delete(params, (err) => {
                if (err) {
                    return reject(err);
                }
                _listOfWords(userName, wordbookName)
                    .then(words => resolve(words))
                    .catch(_ => resolve([]));
            });
        })
            .catch((error) => {
                console.log("error from getCurentUserFromToken");
                reject(error);
            });
    });
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
            // Exact match: `contains` also matched "art" inside "artillery".
            FilterExpression: 'word = :word',
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

/**
 * Save the user's notebook order: each notebook's `sort_order` becomes its
 * position in `wordbooks`. Resolves once every update is saved, rejects if
 * any failed.
 *
 * @param {string} userName
 * @param {string[]|string} wordbooks names in the new order; an array, or
 *   (older callers) one comma-separated string, which breaks on names that
 *   contain a comma
 * @returns {Promise<void>}
 */
async function _orderWordbooksInDynamoDb(userName, wordbooks) {
    const names = Array.isArray(wordbooks) ? wordbooks : String(wordbooks || "").split(",");
    await Promise.all(names.map((name, index) => _setWordbookSortOrder(userName, name, index)));
}

/**
 * @param {string} userName
 * @param {string} wordbook
 * @param {number} sortOrder
 * @returns {Promise<void>} nothing is written for a name that isn't one of
 *   the user's notebooks (the condition stops `update` from creating a row)
 */
async function _setWordbookSortOrder(userName, wordbook, sortOrder) {
    try {
        await database.dynamoDbClientInstance().update({
            TableName: "dictionary_wordbook",
            Key: { user_name: userName, wordbook_name: wordbook },
            ConditionExpression: "attribute_exists(wordbook_name)",
            UpdateExpression: "SET sort_order = :order",
            ExpressionAttributeValues: { ":order": sortOrder },
        }).promise();
    } catch (err) {
        if (err.name === "ConditionalCheckFailedException") return;
        console.error(`Unable to set sort order for ${userName} wordbook: ${wordbook}:`, err.name);
        throw err;
    }
}

/**
 * Save a new order for a wordbook's items: each item's `sort_order` becomes
 * its position in `ids` (0, 1, 2, …). _listOfWords sorts by that number.
 *
 * All updates run in parallel and this resolves only once every one has been
 * saved, or rejects if any failed — so the caller never reports an order as
 * saved when it wasn't.
 *
 * @param {string} userName
 * @param {string} wordbook
 * @param {string[]} ids item ids in the new order: a word's text or a card_id,
 *   the same `id` the item list returns
 * @returns {Promise<void>}
 */
async function _orderWordbookWordsInDynamoDb(userName, wordbook, ids) {
    await Promise.all(ids.map((id, position) =>
        _setWordbookWordSortOrder(userName, wordbook, id, position)));
}

/**
 * Set one item's `sort_order`.
 *
 * DynamoDB's UpdateItem *creates* the item if the key doesn't exist ("upsert").
 * Without a guard, a stale or mistyped id would add a half-empty membership
 * row to the wordbook. The ConditionExpression makes the update apply only to
 * a row that already exists; for a missing one DynamoDB throws
 * ConditionalCheckFailedException, which is ignored here — an item removed
 * while being reordered simply has nothing to reorder.
 *
 * @param {string} userName
 * @param {string} wordbook
 * @param {string} id word text or card_id
 * @param {number} sortOrder position, starting at 0
 * @returns {Promise<void>}
 */
async function _setWordbookWordSortOrder(userName, wordbook, id, sortOrder) {
    try {
        await database.dynamoDbClientInstance().update({
            TableName: "dictionary_wordbooks_words",
            Key: {
                user_name: userName,
                wordbook_name: wordbook + '#' + id,
            },
            UpdateExpression: "set sort_order = :position",
            ConditionExpression: "attribute_exists(wordbook_name)",
            ExpressionAttributeValues: { ":position": sortOrder },
        }).promise();
    } catch (err) {
        if (err.name !== "ConditionalCheckFailedException") {
            throw err;
        }
    }
}

/**
 * Reorder a wordbook's items (POST /wordbook/words/reorder), after the user
 * drags one to a new position.
 *
 * @param {string} userIdToken
 * @param {string} wordbook
 * @param {string[]} words item ids in their new order
 * @param {boolean} needWordList resolve with the re-read item list, so the
 *   caller can confirm the saved order
 */
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

/// Wordbook names are stored as the prefix of "<wordbook>#<item>" keys, so a
/// "#" in a name would make one wordbook's rows look like another's.
function _validateWordbookName(name) {
    const trimmed = (name || "").trim();
    if (trimmed === "") {
        throw new Error("Notebook name can't be empty");
    }
    if (trimmed.includes("#")) {
        throw new Error("Notebook name can't contain #");
    }
    return trimmed;
}

/// All membership rows (words and cards) of a wordbook, with every attribute,
/// following DynamoDB pagination. Rows of a different wordbook whose name merely
/// starts with "<wordbookName>#" are excluded.
async function _queryWordbookRows(userName, wordbookName) {
    const prefix = wordbookName + "#";
    const rows = [];
    let lastKey;

    do {
        const params = {
            TableName: "dictionary_wordbooks_words",
            KeyConditionExpression: "user_name = :userName and begins_with(wordbook_name, :wordbook)",
            ExpressionAttributeValues: {
                ":userName": userName,
                ":wordbook": prefix
            },
        };
        if (lastKey) {
            params.ExclusiveStartKey = lastKey;
        }

        const data = await database.dynamoDbClientInstance().query(params).promise();
        rows.push(...(data.Items || []));
        lastKey = data.LastEvaluatedKey;
    } while (lastKey);

    return rows.filter(row => !row.wordbook_name.substring(prefix.length).includes("#"));
}

/// Rename = copy every row under the new name, then delete the old rows.
/// Rows are copied whole: card rows carry item_type/card_id, and dropping those
/// turns a card into a "word" whose text is the card's GUID.
/// Old rows are only deleted after every copy succeeded, so a failure part-way
/// leaves the original wordbook intact.
async function _rename(userName, wordbookName, newName) {
    newName = _validateWordbookName(newName);
    if (newName === wordbookName) {
        return "Done";
    }

    const db = database.dynamoDbClientInstance();

    const existing = await db.get({
        TableName: "dictionary_wordbook",
        Key: { user_name: userName, wordbook_name: newName }
    }).promise();
    if (existing.Item) {
        throw new Error(`A notebook named "${newName}" already exists`);
    }

    const old = await db.get({
        TableName: "dictionary_wordbook",
        Key: { user_name: userName, wordbook_name: wordbookName }
    }).promise();
    if (!old.Item) {
        throw new Error(`Notebook "${wordbookName}" doesn't exist`);
    }

    const rows = await _queryWordbookRows(userName, wordbookName);
    const oldPrefix = wordbookName + "#";

    await Promise.all(rows.map(row => db.put({
        TableName: "dictionary_wordbooks_words",
        Item: { ...row, wordbook_name: newName + "#" + row.wordbook_name.substring(oldPrefix.length) }
    }).promise()));

    await db.put({
        TableName: "dictionary_wordbook",
        ConditionExpression: "attribute_not_exists(wordbook_name)",
        Item: { ...old.Item, wordbook_name: newName }
    }).promise();

    await Promise.all(rows.map(row => db.delete({
        TableName: "dictionary_wordbooks_words",
        Key: { user_name: userName, wordbook_name: row.wordbook_name }
    }).promise()));

    await db.delete({
        TableName: "dictionary_wordbook",
        Key: { user_name: userName, wordbook_name: wordbookName }
    }).promise();

    return "Done";
}


/**
 * Create a notebook for `userName` directly (no token). Used by inbox.js when a
 * recipient accepts a shared notebook. Rejects with a coded error the caller
 * can map to a user message: INVALID_NAME (bad name) or WORDBOOK_EXISTS (the
 * user already has one by that name).
 *
 * @param {string} userName
 * @param {string} name desired notebook name
 * @returns {Promise<string>} the created (validated) name
 */
async function _addWordbookForUser(userName, name) {
    let wordbookName;
    try {
        wordbookName = _validateWordbookName(name);
    } catch (err) {
        err.code = "INVALID_NAME";
        throw err;
    }
    try {
        await database.dynamoDbClientInstance().put({
            TableName: "dictionary_wordbook",
            ConditionExpression: "attribute_not_exists(wordbook_name)",
            Item: {
                wordbook_name: wordbookName,
                user_name: userName,
                added_datetime: (new Date()).toISOString(),
            },
        }).promise();
    } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
            const e = new Error("A notebook with that name already exists.");
            e.code = "WORDBOOK_EXISTS";
            throw e;
        }
        throw err;
    }
    return wordbookName;
}

/**
 * A copy-ready snapshot of one of `userName`'s notebooks: its words, and each
 * note's title + content. Used by inbox.js to freeze a notebook at share time
 * (like a single note, the recipient gets an independent copy).
 *
 * @param {string} userName
 * @param {string} wordbookName
 * @returns {Promise<{words: string[], cards: {title: string, content: string}[]}>}
 */
async function _notebookItemsForUser(userName, wordbookName) {
    const items = await _listOfWords(userName, wordbookName);
    const words = [];
    const cardsOut = [];
    for (const item of items) {
        if (item.type === "card") {
            const card = await cards._getCardForUser(userName, item.id);
            if (card) {
                cardsOut.push({ title: card.title, content: card.content });
            }
        } else {
            words.push(item.id);
        }
    }
    return { words, cards: cardsOut };
}

module.exports = {
    addWordbook,
    deleteWordbook,
    listWordbooks,
    listWordbooksWithWords,
    listWordbooksMeta,
    touchWordbooksForCard,
    addWordToWordbook,
    deleteWordFromWordbook,
    addCardToWordbook,
    removeCardFromWordbook,
    listofWords,
    listOfWordbooksForWord,
    reorder,
    reorderWords,
    rename,
    _addItemForUser,
    _wordbookExists,
    _addWordbookForUser,
    _notebookItemsForUser

}