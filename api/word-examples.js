const axios = require('axios');
const db = require('./dynamoDb');

const WORDNIK_API_KEY = process.env.WORDNIK_API_KEY;

function getExamples(word) {
    return new Promise((resolve) => {
        //TODO: check if examples exist in DynamoDb
        //TODO: check if user created his or her own examples (stored in DynamoDb)
        const promiseEx = getExamplesFromDynamoDb(word);
        const promiseUserCreatedEx = getUserCreatedExamples(word);

        Promise.all([promiseEx, promiseUserCreatedEx])
            .then((values) => {
                examplesFromDb = values[0];
                examplesUserCreatedFromDb = values[1];

                let result = {};

                if (examplesUserCreatedFromDb != null) {
                    result["myExamples"] = examplesUserCreatedFromDb;
                }
                if (examplesFromDb != null) {
                    result["examples"] = examplesFromDb;

                    resolve(result);
                } else {
                    //database had no examples; query Wordnik, save to database
                    getWordExamplesFromWordnik(word).then((value => {
                        let { Examples: examplesFromWordnik } = value;

                        if (examplesFromWordnik != undefined) {
                            result["examples"] = examplesFromWordnik;
                        } else {
                            result["error"] = value.Error;
                        }

                        resolve(result);

                    }))
                        .catch(err => {
                            result["error"] = err.Error;
                            resolve(result);
                        });
                }
            })

    });
    // .catch(error => {
    //     console.log(error);
    // });
}

function getUserCreatedExamples(word) {
    return Promise.resolve(null);
    // return new Promise((resolve, reject) => {
    //     resolve(null);
    // });
}

function getExamplesFromDynamoDb(word) {
    return new Promise((resolve) => {

        const docClient = db.dynamoDbClientInstance();

        let paramsLookupDb = {
            TableName: "dictionary_examples",
            Key: {
                "word": word
            }
        };

        let dbPromise = new Promise((resolveDb, rejectDb) => {
            docClient.get(paramsLookupDb, function (err, dataFromDb) {
                if (err) {
                    console.error("Unable to read dictionary_examples item. Error JSON:", JSON.stringify(err, null, 2));
                    rejectDb(err);
                }
                else {
                    if (dataFromDb.Item != undefined && dataFromDb.Item != null) {
                        resolveDb(dataFromDb.Item.examples);

                    }
                    else {
                        resolveDb(null);
                    }
                }

            });
        })
            .then(examples => resolve(examples))
            .catch(errGettingDataFromDb => {
                console.log("Error getting examples from DynamoDb:\n" + errGettingDataFromDb);
                resolve(null);
            });
    });
}

function saveExamplesToDynamoDb(word, examples) {
    //https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html

    const docClient = db.dynamoDbClientInstance();

    let params = {
        TableName: "dictionary_examples",
        ConditionExpression: "attribute_not_exists(word)",
        Item: {
            word: word,
            examples: examples,
            create_datetime: (new Date()).toISOString(),
        }
    };

    docClient.put(params, function (err) {
        if (err) {
            console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            //console.log("Added item:", JSON.stringify(result, null, 2));
        }
    });
}

function getWordExamplesFromWordnik(word) {
    return new Promise((resolve, reject) => {

        let wordAdjusted = word.toLowerCase();

        //make a request to wordnik
        let wordnikURL = "https://api.wordnik.com/v4/word.json/" +
            encodeURIComponent(wordAdjusted) + "/examples?" +
            "useCanonical=true" +
            "&api_key=" + WORDNIK_API_KEY;


        axios.get(wordnikURL)
            .then(response => {
                //console.log(JSON.stringify(response.data, null, 2));

                if (response.data.examples.length > 0) {
                    let examples = [];
                    let duplicates = Object();

                    response.data.examples.forEach(item => {

                        if (typeof (item.text) !== "undefined" && item.text != null) {
                            let include = true;
                            let startsWith = item.text.substring(0, 49);

                            if (duplicates[startsWith] != undefined) {
                                include = false;
                            }

                            if (include) {
                                if (item.text.length < 2048) {
                                    if (item.text.toLowerCase().indexOf(wordAdjusted) >= 0) {
                                        examples.push(item.text);
                                        duplicates[startsWith] = startsWith;
                                    }
                                }
                            }
                        }
                    })

                    //console.log(JSON.stringify(examples, null, 2));

                    if (examples.length > 0) {
                        resolve({ Examples: examples });

                        saveExamplesToDynamoDb(word, examples);
                    }
                    else {
                        resolve({ Error: `We don't have examples for ${word}` });
                    }
                }

            })
            .catch(error => {

                if (error.response != null) {
                    if (error.response.status === 404) {
                        reject({ Error: `Sorry, we don't have examples for '${word}'` });
                    }
                    else {
                        reject({ Error: error.response.data.message });
                    }

                    return;
                }

                reject({ Error: "No Found" });

            });
    });

}

module.exports = {
    getExamples

}