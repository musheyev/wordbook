const express = require("express");
const wordnik = require("../wordnik");
const wp = require("../word-pictures");
const ex = require("../word-examples");
const uh = require("../user-history");
const wn = require("../word-notes");
const sv = require("../source-votes");
const userImages = require("../user-word-images");
const ttsRefs = require("../tts-refs");
const wordbookStore = require("../wordbook");
const { getCurentUserFromToken } = require("../auth");
const curation = require("../image-curation");
const { requireAdmin } = require("../cognitoUsers");
const { handle: curationHandle } = require("./adminRouter");

// Words are cached lower-cased and trimmed (see the lookup route below), so
// curation must address them the same way.
const normalizeWord = (word) => String(word || "").trim().toLowerCase();

const log = require("../logger");

let dictionaryRouter = express.Router();

/**
 * The signed-in user's own data for a word (see the lookup route). Never
 * rejects: a part that fails is simply missing.
 *
 * @returns {Promise<{note?, sourceVotes?, myImages?, notebooks?}|null>}
 */
async function personalWordData(token, word) {
    let userName;
    try {
        userName = await getCurentUserFromToken(token);
    } catch (err) {
        return null; // expired login: the lookup still works without it
    }
    const settle = (promise) => promise.then((value) => ({ ok: true, value }), () => ({ ok: false }));
    const [note, votes, mine, notebooks] = await Promise.all([
        settle(wn.getWordNote(token, word)),
        settle(sv.getSourceVotes(token, word)),
        settle(userImages.listImages(userName, word)),
        settle(wordbookStore.listOfWordbooksForWord(token, word)),
    ]);
    const personal = {};
    if (note.ok) personal.note = note.value || null;
    if (votes.ok) personal.sourceVotes = votes.value || {};
    if (mine.ok) personal.myImages = mine.value || [];
    if (notebooks.ok) personal.notebooks = Array.isArray(notebooks.value) ? notebooks.value : [];
    return personal;
}

// ---------------------------------------------------------------------------
// Image curation on a word page (admins only; see image-curation.js).
// Images are shared by every user, so changing them needs an admin. The
// requireAdmin check here is the real protection; the app only hides the
// controls from other users.
// ---------------------------------------------------------------------------

// Body: { word, url }. Responds with the word's images after the change.
dictionaryRouter.post("/images/delete", requireAdmin, curationHandle(async (req, res) => {
    res.json({ images: await curation.deleteImage(normalizeWord(req.body.word), req.body.url) });
}));

// Undo a delete. Body: { word, url }.
dictionaryRouter.post("/images/restore", requireAdmin, curationHandle(async (req, res) => {
    res.json({ images: await curation.restoreImage(normalizeWord(req.body.word), req.body.url) });
}));

// Body: { word, count } or { word, replaceAll: true }.
// Responds with { images, added, requested }.
dictionaryRouter.post("/images/refresh", requireAdmin, curationHandle(async (req, res) => {
    res.json(await curation.refreshImages(normalizeWord(req.body.word), {
        count: req.body.count,
        replaceAll: req.body.replaceAll === true,
    }));
}));

dictionaryRouter.post("", function (req, res) {

    let item = req.body.search;
    res.redirect("/dictionary?search=" + item);

});

dictionaryRouter.get("/oldapi", function (req, res) {

    log("query: " + req.query.search);
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
        // getUserHistory now returns words most-recently-searched first, so send
        // as-is (no reverse).
        const history = Array.isArray(data) ? data : [];
        res.send(JSON.stringify(history));
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

// ---------------------------------------------------------------------------
// Per-word notes: a personal note shown above the definitions on a word's page.
// ---------------------------------------------------------------------------
dictionaryRouter.get("/note", function (req, res) {
    const token = req.cookies.id_token;
    wn.getWordNote(token, req.query.word)
        .then((content) => res.json({ content: content || null }))
        .catch((error) => {
            log("word note get error: " + error);
            res.status(500).json({ content: null });
        });
});

dictionaryRouter.post("/note", function (req, res) {
    const token = req.cookies.id_token;
    const word = req.body.word;
    if (!word) return res.status(400).json({ error: "word is required" });
    wn.saveWordNote(token, word, req.body.content)
        .then((content) => res.json({ content }))
        .catch((error) => {
            log("word note save error: " + error);
            res.status(500).json({ error: "Could not save note" });
        });
});

dictionaryRouter.post("/note/delete", function (req, res) {
    const token = req.cookies.id_token;
    const word = req.body.word;
    if (!word) return res.status(400).json({ error: "word is required" });
    wn.deleteWordNote(token, word)
        // That note's read-aloud audio is no longer used (see tts-refs.js).
        .then(() => getCurentUserFromToken(token)
            .then((userName) => ttsRefs.removeUserItem(userName, `wordnote:${word}`))
            .catch((err) => log("tts refs cleanup error: " + err)))
        .then(() => res.json({ content: null }))
        .catch((error) => {
            log("word note delete error: " + error);
            res.status(500).json({ error: "Could not delete note" });
        });
});

// Per-user, per-word thumbs that order the dictionary sources. See source-votes.js.
// ---------------------------------------------------------------------------
dictionaryRouter.get("/source-votes", function (req, res) {
    sv.getSourceVotes(req.cookies.id_token, req.query.word)
        .then((votes) => res.json({ votes }))
        .catch((error) => {
            log("source votes get error: " + error);
            res.status(500).json({ votes: {} });
        });
});

dictionaryRouter.post("/source-vote", function (req, res) {
    const { word, source, vote } = req.body;
    if (!word || !source) return res.status(400).json({ error: "word and source are required" });
    sv.setSourceVote(req.cookies.id_token, word, source, Number(vote) || 0)
        .then((votes) => res.json({ votes }))
        .catch((error) => {
            log("source vote save error: " + error);
            res.status(500).json({ error: "Could not save vote" });
        });
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

        // The signed-in user's own things for this word, sent with the lookup
        // so the word page needs one request instead of five on a slow
        // connection: their note, source thumbs, own images, and which of
        // their notebooks hold the word. Each part that fails is left out
        // rather than failing the lookup (the app then fetches it alone).
        const originalWord = String(req.query.search).trim();
        const personalPromise = (shouldSendJson === 'y' && token)
            ? personalWordData(token, originalWord)
            : Promise.resolve(null);

        // Check whether the word is new before anything else starts: a new
        // word's definitions get saved during this lookup, after which it
        // would look like a word seen before. Only new words search for
        // images automatically (see word-pictures.js).
        wordnik.isNewWord(wordToSearch)
            .then(isNewWord => Promise.all([
                wp.getWordPictures(wordToSearch, isNewWord),
                wordnik.getWordDefinitions(wordToSearch),
                ex.getExamples(wordToSearch),
            ]))
            .then(async ([images, definitions, { examples }]) => {

                if (token != undefined) {
                    uh.saveUserHistoryToDynamoDb(wordToSearch, token);
                }

                if (shouldSendJson == 'y') {
                    const personal = await personalPromise;
                    res.send(JSON.stringify({
                        definitions: definitions, images: images, examples,
                        ...(personal ? { personal } : {}),
                    }));
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