
const axios = require('axios');
const db = require('./dynamoDb');

const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

function getWordPictures(word) {
    return new Promise((resolve, reject) => {

        let resolved = false;
        const docClient = db.dynamoDbClientInstance();

        let paramsLookupDb = {
            TableName: "dictionary_images",
            Key: {
                "word": word
            }
        };

        let dbPromise = new Promise((resolve1, reject1) => {
            docClient.get(paramsLookupDb, function (err, dataFromDb) {
                if (err) {
                    console.error("Unable to read dictionary_images item. Error JSON:", JSON.stringify(err, null, 2));
                    reject1(err);
                }
                else {
                    if (dataFromDb.Item != undefined && dataFromDb.Item != null) {
                        //console.log("data from db: \n" + dataFromDb.Item.images)
                        resolve1(dataFromDb.Item.images);

                    }
                    else {
                        resolve1(null);
                    }
                }

            });
        })
            .catch(errGettingDataFromDb => {
                console.log("Error getting images from DynamoDb:\n" + errGettingDataFromDb);
                resolve(null);
            })
            .then(images => {
                if (images != null) {
                    resolve(images);
                }
                else {

                    let googleSearchURL = "https://www.googleapis.com/customsearch/v1?" +
                        "key=" + GOOGLE_SEARCH_KEY + "&cx=" + GOOGLE_SEARCH_CX +
                        "&num=5" +
                        "&searchType=image&q=" + word;

                    axios.get(googleSearchURL)
                        .then(response => {

                            let rawData = response.data;
                            //console.log(JSON.stringify(rawData, null, 2));

                            images = rawData.items.map(temp => temp.link);

                            //https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html
                            let params = {
                                TableName: "dictionary_images",
                                ConditionExpression: "attribute_not_exists(word)",
                                Item: {
                                    word: word,
                                    images: images
                                }

                            };

                            docClient.put(params, function (err, result) {
                                if (err) {
                                    console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
                                } else {
                                    //console.log("Added item:", JSON.stringify(result, null, 2));
                                }
                            });

                            //console.log("Google search data: \n" + images);
                            resolve(images);
                        })
                        .catch(searchError => {
                            console.log("Google search error: " + searchError);
                            reject(searchError);
                        });
                }
            })

    })
        .catch(error => {
            console.log(error);
        });
}

//test
// getWordPictures("omelett")
//     .then(data => {
//         console.log("End Result: \n" + data);
//     });

module.exports = {
    getWordPictures

}