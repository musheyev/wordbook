// A personal note attached to a dictionary word (not a notebook card). One note
// per (user, word), stored in `dictionary_word_notes` (PK user_name, SK word).
// Shown above the dictionary definitions on the word's page.
const db = require('./dynamoDb');
const getCurentUserFromToken = require('./auth').getCurentUserFromToken;

const TABLE = 'dictionary_word_notes';

// Words are keyed the same way the dictionary stores/searches them.
const normalize = (word) => (word || '').trim().toLowerCase();

function getWordNote(userIdToken, word) {
    return new Promise((resolve) => {
        const w = normalize(word);
        if (!userIdToken || !w) return resolve(null);
        getCurentUserFromToken(userIdToken).then((userName) => {
            db.dynamoDbClientInstance().get(
                { TableName: TABLE, Key: { user_name: userName, word: w } },
                (err, data) => {
                    if (err) {
                        console.log('getWordNote error:', err.name || err);
                        return resolve(null);
                    }
                    resolve(data && data.Item ? (data.Item.content || null) : null);
                }
            );
        }).catch(() => resolve(null));
    });
}

function saveWordNote(userIdToken, word, content) {
    return new Promise((resolve, reject) => {
        const w = normalize(word);
        if (!userIdToken || !w) return resolve(null);
        getCurentUserFromToken(userIdToken).then((userName) => {
            db.dynamoDbClientInstance().put(
                {
                    TableName: TABLE,
                    Item: {
                        user_name: userName,
                        word: w,
                        content: content || '',
                        updated_at: new Date().toISOString(),
                    },
                },
                (err) => (err ? reject(err) : resolve(content || ''))
            );
        }).catch(reject);
    });
}

function deleteWordNote(userIdToken, word) {
    return new Promise((resolve, reject) => {
        const w = normalize(word);
        if (!userIdToken || !w) return resolve(null);
        getCurentUserFromToken(userIdToken).then((userName) => {
            db.dynamoDbClientInstance().delete(
                { TableName: TABLE, Key: { user_name: userName, word: w } },
                (err) => (err ? reject(err) : resolve(null))
            );
        }).catch(reject);
    });
}

module.exports = { getWordNote, saveWordNote, deleteWordNote };
