const express = require("express");
const wordnik = require("../wordnik");
const wp = require("../word-pictures");
const ex = require("../word-examples");
const uh = require("../user-history");

const log = require("../logger");

let dictionaryRouter = express.Router();

dictionaryRouter.post("", function (req, res) {

    let item = req.body.search;
    res.redirect("/dictionary?search=" + item);

});

dictionaryRouter.get("/oldapi", function (req, res) {

    log("query: " + req.query.search);
    log("headers: " + JSON.stringify(req.headers));

    let wordToSearch = req.query.search;

    let shouldSendJson = null;
    if (req.query.json != null) {
        shouldSendJson = req.query.json.toLowerCase();
    }

    log("need json: " + shouldSendJson);

    let definitions = null;
    let exampleUses = [];
    let images = [];

    if (wordToSearch != null) {
        wordToSearch = wordToSearch.trim().toLowerCase();

        wp.getWordPictures(wordToSearch)
            .catch(err => {
                //ignore errors
            })
            .then(imageLinks => {
                images = imageLinks;
                //console.log("Images:", JSON.stringify(images, null, 2));

                const token = req.cookies.id_token;

                wordnik.getWordDefinitions(wordToSearch)
                    .then(response => {
                        definitions = response;

                        uh.saveUserHistoryToDynamoDb(wordToSearch, token);

                        if (shouldSendJson == 'y') {
                            res.send(JSON.stringify({ definitions: definitions, images: images }));
                        }
                        else {
                            log("about to render");
                            //render
                            res.render("dictionary", {
                                search: wordToSearch,
                                definitions: definitions,
                                examples: exampleUses,
                                images: images
                            });
                        }

                    })
                    .catch(error => {

                        log("ERROR: " + JSON.stringify(error, null, 2));

                        let userMessage = "";
                        if (error.message == "Request failed with status code 404") {
                            userMessage = "<em class='red'>" + wordToSearch + "</em> was not found."
                        }
                        res.render("dictionary", {
                            search: userMessage,
                            definitions: [""],
                            examples: [""],
                            images: [""]
                        });
                    });
            })
    }
    else {
        res.render("dictionary", {
            search: "",
            definitions: [""],
            examples: [""],
            images: [""]
        });
    }
});

dictionaryRouter.get("/history", function (req, res) {

    log("Got request on /dictionary/history");

    const token = req.cookies.id_token;
    //console.log(`token=${token}`);

    uh.getUserHistory(token).then(data => {
        // getUserHistory returns "" when there is no token; only arrays are reversible.
        const history = Array.isArray(data) ? data : [];
        res.send(JSON.stringify(history.reverse()));
    })
        .catch(error => {
            log("Error handling request to /dictionary/history: " + error.name);

            if (error.name === "TokenExpiredError") {
                res.status(401).end(error.message);
            }
        })

});

dictionaryRouter.get("/history/delete", function (req, res) {

    log("Got request on /dictionary/history/delete");

    let wordToDelete = req.query.word;

    //log(`wordToDelete=${wordToDelete}`);

    const token = req.cookies.id_token;

    //console.log(`token=${token}`);

    uh.deleteWordFromHistory(token, wordToDelete).then(data => {

        //console.log(data);

        //res.send(JSON.stringify( "" ));
        res.send(JSON.stringify(data));
    })
        .catch(error => {
            log(error);
        })

});

dictionaryRouter.get("/examples", function (req, res) {

    log("Got request on /dictionary/examples");

    log("query: " + req.query.search);
    //log("headers: " + JSON.stringify(req.headers));

    let wordToSearch = req.query.search;

    const token = req.cookies.id_token;
    ex.getExamples(wordToSearch).then(data => {

        //console.log(data);

        //res.send(JSON.stringify( "" ));
        res.send(JSON.stringify(data));
    })
        .catch(error => {
            log(error);
        })


});

dictionaryRouter.get("", function (req, res) {

    log("query: " + req.query.search);
    log("headers: " + JSON.stringify(req.headers));

    let wordToSearch = req.query.search;

    let shouldSendJson = null;
    if (req.query.json != null) {
        shouldSendJson = req.query.json.toLowerCase();
    }

    log("need json: " + shouldSendJson);

    let definitions = null;
    let examples = [];
    let images = [];

    if (wordToSearch != null) {
        wordToSearch = wordToSearch.trim().toLowerCase();

        const token = req.cookies.id_token;

        let wordPicturesPromise = wp.getWordPictures(wordToSearch);
        let wordDefinitionsPromise = wordnik.getWordDefinitions(wordToSearch);
        let getExamplesPromise = ex.getExamples(wordToSearch);

        Promise.all([wordPicturesPromise, wordDefinitionsPromise, getExamplesPromise])
            .then(([images, definitions, { examples }]) => {

                if (token != undefined) {
                    uh.saveUserHistoryToDynamoDb(wordToSearch, token);
                }

                if (shouldSendJson == 'y') {
                    res.send(JSON.stringify({ definitions: definitions, images: images, examples }));
                }
                else {
                    log("about to render");
                    //render
                    res.render("dictionary", {
                        search: wordToSearch,
                        definitions: definitions,
                        examples: examples,
                        images: images
                    });
                }
            })
            .catch(error => {

                log("ERROR: " + JSON.stringify(error, null, 2));

                let userMessage = "";
                if (error.message == "Request failed with status code 404") {
                    if (shouldSendJson == 'y') {
                        userMessage = "'" + wordToSearch + "' was not found."
                    } else {
                        userMessage = "<em class='red'>" + wordToSearch + "</em> was not found."
                    }

                }
                if (shouldSendJson == 'y') {
                    res.send(JSON.stringify({ Error: userMessage }));
                } else {
                    res.render("dictionary", {
                        search: userMessage,
                        definitions: [""],
                        examples: [""],
                        images: [""]
                    });
                }

            });;
    }
    else {
        res.render("dictionary", {
            search: "",
            definitions: [""],
            examples: [""],
            images: [""]
        });
    }
});

module.exports = dictionaryRouter;