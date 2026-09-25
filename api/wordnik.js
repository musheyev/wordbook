const axios = require('axios');
const db = require('./dynamoDb');

const WORDNIK_API_KEY = process.env.WORDNIK_API_KEY;

function getDefinitions(word) {
    let definitions = [];
    let exampleUses = [];

    if (word != null) {
        //make a request to wordnik
        let wordnikURL = "https://api.wordnik.com/v4/word.json/" +
            word + "/definitions?" +
            "&includeRelated=false&useCanonical=false&includeTags=false" +
            "&api_key=" + WORDNIK_API_KEY;

        axios.get(wordnikURL)
            .then(response => {
                let data = JSON.stringify(response.data, null, 2);

            })
            .catch(error => {
                console.log(error);
            });

        //   fetch(wordnikURL)
        //   .then(rawdata => rawdata.json())
        //   .then(data => {
        //     if (data.length > 0) {
        //         data.forEach(item => {
        //             if (item.text != null) {
        //                 definitions.push(item.text);
        //             }

        //             let examples = item.exampleUses;
        //             if (examples != null && examples.length > 0) {
        //                 examples.forEach(example => exampleUses.push(example.text));
        //             }
        //         })
        //     }  
        //   })


    }
}

function getAttributionText(sourceDictionary) {
    switch (sourceDictionary) {
        case "ahd-5":
            return "from The American Heritage® Dictionary of the English Language, 5th Edition.";
        case "century":
            return "from The Century Dictionary.";
        case "gcide":
            return "from the GNU version of the Collaborative International Dictionary of English.";
        case "wiktionary":
            return "from Wiktionary, Creative Commons Attribution/Share-Alike License.";
        case "wordnet":
            return "from WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.";
        default:
            return sourceDictionary;
    }
}

function getSourceDictionary(attributionText) {
    switch (attributionText) {
        case "from The American Heritage® Dictionary of the English Language, 5th Edition.":
            return "ahd-5";
        case "from The Century Dictionary.":
            return "century";
        case "from the GNU version of the Collaborative International Dictionary of English.":
            return "gcide";
        case "from Wiktionary, Creative Commons Attribution/Share-Alike License.":
            return "wiktionary";
        case "from WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.":
            return "wordnet";
        default:
            return attributionText;
    }
}

function transformResponse(dataIn) {
    //build an associative array with attribution text as key and array of definitions as value

    if (dataIn == null || dataIn.Item == null || dataIn.Item.definitions == null) {
        return null;
    }

    let dataOut = Object();

    dataIn.Item.definitions.forEach(item => {
        let attributionText = getAttributionText(item.source);

        if (dataOut[attributionText] == null) {
            dataOut[attributionText] = [];
        }

        dataOut[attributionText].push(item.text);
    });

    return dataOut;
}

function saveWordDefinitionsToDynamoDb(word, definitions, userIdToken) {
    //console.log("word: " + word);
    //console.log("definitions: " +  JSON.stringify(definitions, null, 2));
    //console.log(Array.isArray(definitions));

    if (word != null && definitions != null) {
        const dbParameter = {
            TableName: "dictionary",
            ConditionExpression: "attribute_not_exists(word)",
            Item: {
                word: word,
                definitions: []
            }
        }

        for (var key in definitions) {
            let sourceDictionary = getSourceDictionary(key);
            let temp = definitions[key];

            temp.forEach(element => {
                dbParameter.Item.definitions = [...dbParameter.Item.definitions, {
                    source: sourceDictionary,
                    text: element
                }];
            })
        };

        //console.log("Saving item:", JSON.stringify(dbParameter, null, 2));

        const docClient = db.dynamoDbClientInstance();

        docClient.put(dbParameter, function (err, data) {
            if (err) {
                console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                //console.log("Added item:", JSON.stringify(dbParameter, null, 2));
            }
        });
    }
}


function getWordDefinitionsFromDynamoDb(word) {
    var params = {
        TableName: "dictionary",
        Key: {
            "word": word
        }
    };

    return new Promise((resolve, reject) => {
        const docClient = db.dynamoDbClientInstance();

        docClient.get(params, (err, data) => {
            if (err)
                reject(err);
            else
                resolve(data);
        });
    });
}

function getWordDefinitionsFromDb(word) {
    let data = null;
    let dataTransformed = null;

    return new Promise((resolve, reject) => {
        getWordDefinitionsFromDynamoDb(word).then(data => {
            if (data != null) {
                try {
                    dataTransformed = transformResponse(data);
                }
                catch (errTransforming) {
                    console.error("Error transforming response in getWordDefinitionsFromDb:", JSON.stringify(errTransforming, null, 2));
                    reject(errTransforming);
                }

            }
            resolve(dataTransformed);
        })
            .catch(err => {
                console.error("Error in getWordDefinitionsFromDb:", JSON.stringify(err, null, 2));
                reject(err);
            })
    });
}


function getWordDefinitionsFromWordnik(word) {
    let definitions = Object();

    let wordnikURL = "https://api.wordnik.com/v4/word.json/" + encodeURIComponent(word) + "/definitions?" +
        "&includeRelated=false&useCanonical=false&includeTags=false&limit=20" +
        "&api_key=" + WORDNIK_API_KEY;

    return new Promise((resolve, reject) => {
        axios.get(wordnikURL)
            .then(response => {

                let data = response.data;

                if (data.length > 0) {
                    //console.log(data);
                    data.forEach(item => {
                        if (typeof (item.text) !== "undefined" && item.text != null) {
                            //console.log("data from wordnik = " + JSON.stringify(item, null, 2));
                            if (definitions[item.attributionText] == null) {
                                definitions[item.attributionText] = [];
                            }

                            if (item.text.length < 510) {
                                definitions[item.attributionText].push(item.text);
                            }
                        }
                    })
                }

                resolve(definitions);
            })
            .catch(errFromWordnikRequest => {
                //console.log("Error in getWordDefinitionsFromWordnik:", JSON.stringify(errFromWordnikRequest, null, 2));
                reject(errFromWordnikRequest);
            });

    });
}

// Cached definitions from DynamoDB, else Wordnik (and cache the result). If the
// cache read fails, fall back to Wordnik rather than leaving the request
// unanswered.
function getWordDefinitions(word) {
    return getWordDefinitionsFromDb(word)
        .catch(errFromDb => {
            console.error("Error getting word definition from db.  Trying wordnik API.  In getWordDefinitions:", JSON.stringify(errFromDb, null, 2));
            return null;
        })
        .then(dataFromDb => {
            if (dataFromDb != null) {
                return dataFromDb;
            }

            return getWordDefinitionsFromWordnik(word).then(dataFromWordnik => {
                saveWordDefinitionsToDynamoDb(word, dataFromWordnik);
                return dataFromWordnik;
            });
        });
}

//#region old code

// async function getWordFromDb_old(word) {
//     let data = null;
//     let dataTransformed = null;

//     try {
//         data = await getWordDefinitionsFromDynamoDb(word);

//         //console.log("data=" + JSON.stringify(data, null, 2));

//         if (data != null) {
//             dataTransformed = transformResponse(data);
//             //console.log("transformed data = " + JSON.stringify(dataTransformed, null, 2));
//         }

//         return dataTransformed;
//     }
//     catch (err) {
//         console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
//     }
// }

//#endregion


//tests
// getWordFromDb("netu").then(data => {
//     console.log("Test data out: \n" + JSON.stringify(data, null, 2));
// });

// getWordDefinitions("vaunted").then(data => {
//     console.log("Test data out: \n" + JSON.stringify(data, null, 2));
// }).catch(err => {
//     console.log("Error: \n", JSON.stringify(err, null, 2));
// });

module.exports = {
    getWordDefinitions

}