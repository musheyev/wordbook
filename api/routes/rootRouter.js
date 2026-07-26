const express = require("express");

let router = express.Router();

router.get("", function (request, response, next) {
    //response.sendFile(__dirname + "/index.html");
  
    response.send("This page is not implemented");
});

router.post("", function (req, res) {

    res.send("This page is not implemented");

  });

module.exports = router;