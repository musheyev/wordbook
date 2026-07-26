const express = require("express");
const wordbook = require("../wordbook.js");

let wordbookRouter = express.Router();

wordbookRouter.post("/add", function (req, res) {

    let wordbookName = req.body.name;

    let returnListWithPreview = false;

    if (req.body.preview) {
        returnListWithPreview = true;
    }

    console.log(`Recieved a post to ${req.url}`);
    console.log(`name=${wordbookName}`);
    console.log(`preview=${returnListWithPreview}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.addWordbook(token, wordbookName, returnListWithPreview).then((data) => {
        //console.log(data);
        res.send(data);
    })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(err);

            let errorMessage = err.message;
            if (err.code == "ConditionalCheckFailedException") {
                errorMessage = `Wordbook "${wordbookName}" already exists`;
            }
            res.status(400).end(errorMessage);
        })


});

wordbookRouter.post("/delete", function (req, res) {

    let wordbookName = req.body.name;

    let returnListWithPreview = false;

    if (req.body.preview) {
        returnListWithPreview = true;
    }

    console.log(`Recieved a post to ${req.url}`);
    console.log(`name=${wordbookName}`);
    console.log(`preview=${returnListWithPreview}`);

    //console.log("headers: " + JSON.stringify(req.headers));

    //
    const { id_token: token } = req.cookies;
    wordbook.deleteWordbook(token, wordbookName, true, returnListWithPreview).then((data) => {
        console.log("Sending");
        console.log(JSON.stringify(data, 2));
        res.send(data);
    })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(err);

            let errorMessage = err.message;

            res.status(400).end(errorMessage);
        })


});

wordbookRouter.get("/list", function (req, res) {
    console.log("received request on wordbook/list");
    const { id_token: token } = req.cookies;

    let withPreview = req.query.preview;

    let promiseWordbooks;
    if (withPreview === 'y') {
        promiseWordbooks = wordbook.listWordbooksWithWords(token);
    } else {
        promiseWordbooks = wordbook.listWordbooks(token);
    }

    promiseWordbooks
        .then((data) => {
            console.log("wordbooks");
            console.log(data);
            res.send(data);
        })
        .catch(err => {
            console.log(`listWordbooksWithIdTokenCheck error: ${err.name}`);

            if (err.name === "TokenExpiredError") {
                res.status(401).end("Your login session expired.  Please login again.");
            } else {
                res.status(400).end(err.message);
            }

        })
});

wordbookRouter.post("/word/add", function (req, res) {

    let wordbookName = req.body.wordbook;
    let word = req.body.word;

    console.log(`POST to /word/add:  wordbookName=${wordbookName}, word=${word}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.addWordToWordbook(token, wordbookName, word).then((data) => {
        //console.log(data);
        res.send(data);
    })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(err);

            let errorMessage = err.message;
            if (err.code == "ConditionalCheckFailedException") {
                errorMessage = `Word "${word}" already exists`;
            }
            res.status(400).end(errorMessage);
        })


});

wordbookRouter.post("/word/delete", function (req, res) {

    let wordbookName = req.body.wordbook;
    let word = req.body.word;

    console.log(`POST to /word/delete:  wordbookName=${wordbookName}, word=${word}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.deleteWordFromWordbook(token, wordbookName, word).then((data) => {
        //console.log(data);
        res.send(data);
    })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(err);

            let errorMessage = err.message;
            // if (err.code == "ConditionalCheckFailedException") {
            //     errorMessage = `Word "${word}" already exists`;
            // }
            res.status(400).end(errorMessage);
        })


});

wordbookRouter.post("/word/wordbooks", function (req, res) {
    console.log("received request on wordbook/word/wordbooks");
    let word = req.body.word;
    const { id_token: token } = req.cookies;
    wordbook.listOfWordbooksForWord(token, word).then((data) => {
        console.log("list of wordbooks");
        console.log(data);
        res.send(data);
    })
        .catch(err => {
            //console.log(`listWordbooksWithIdTokenCheck error: ${err.code}`);
            console.log(err);
            res.status(400).end(errorMessage);
        })
});

wordbookRouter.post("/words", function (req, res) {

    let wordbookName = req.body.wordbook;

    console.log(`POST to wordbook/words:  wordbookName=${wordbookName}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.listofWords(token, wordbookName).then((data) => {
        console.log(data);
        res.send(data);
    })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(err);

            let errorMessage = err.message;

            res.status(500).end(errorMessage);
        })


});

wordbookRouter.post("/reorder", function (req, res) {

    let wordbooks = req.body.wordbooks;
    let returnResultWithPreview = req.body.preview === 'y';
    let needWordbookList = req.body.needWordbookList === 'y'

    console.log(`POST to ${req.url}:  wordbooks=${wordbooks}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.reorder(token, wordbooks, needWordbookList, returnResultWithPreview)
        .then((data) => {
            //console.log(data);
            if (needWordbookList) {
                res.send(data);
            } else {
                res.status(200).end("reorder done");
            }

        })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(`reorder error: ${err.name}`);

            if (err.name === "TokenExpiredError") {
                res.status(401).end("Your login session expired.  Please login again.");
            } else {
                res.status(400).end(err.message);
            }
        })


});

wordbookRouter.post("/words/reorder", function (req, res) {

    let wordbookName = req.body.wordbook;
    let words = req.body.words;
    let needWordList = req.body.needWordList === 'y'

    console.log(`received post request on ${req.url}`);
    console.log(`wordbook=${wordbookName}; words=${words}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.reorderWords(token, wordbookName, words, needWordList)
        .then((data) => {
            //console.log(data);
            if (needWordList) {
                res.send(data);
            } else {
                res.status(200).end("reorder done");
            }

        })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(`reorder error: ${err.name}`);

            if (err.name === "TokenExpiredError") {
                res.status(401).end("Your login session expired.  Please login again.");
            } else {
                res.status(400).end(err.message);
            }
        })


});

wordbookRouter.post("/rename", function (req, res) {

    let wordbookName = req.body.wordbook;
    let newName = req.body.name;

    console.log(`POST to ${req.url}:  wordbook=${wordbookName} and name=${newName}`);

    //
    const { id_token: token } = req.cookies;
    wordbook.rename(token, wordbookName, newName)
        .then((data) => {
            console.log(data);
            res.status(200).end("rename done");

        })
        .catch(err => {
            //console.log(`addWordbook error: ${err.code}`);
            console.log(`rename error: ${err.name}`);

            if (err.name === "TokenExpiredError") {
                res.status(401).end("Your login session expired.  Please login again.");
            } else {
                res.status(400).end(err.message);
            }
        })


});


module.exports = wordbookRouter;