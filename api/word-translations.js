const axios = require('axios');

const GOOGLE_TRANSLATE_KEY = process.env.GOOGLE_TRANSLATE_KEY;

function getWordTranslation(word) {
    let googleSearchURL = "https://translation.googleapis.com/language/translate/v2?key=" + GOOGLE_TRANSLATE_KEY;

    const postParameter = {
        "q": [word],
        "target": "ru"
      }

    axios.post(googleSearchURL, postParameter)
    .then(result => {
        
        //console.log(JSON.stringify(result.data.data.translations));
    })
}

module.exports = {
    getWordTranslation

}