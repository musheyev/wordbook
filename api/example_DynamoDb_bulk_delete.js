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
