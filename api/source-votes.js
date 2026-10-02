// Per-user, per-word thumbs for dictionary sources. One row per (user, word) in
// `dictionary_word_source_votes` (PK user_name, SK word), holding a small map:
//   votes: { "<source label>": 1 | -1 }
// Liked (+1) sources sort to the top of that word's definitions, disliked (-1)
// to the bottom — in that user's view only. Private: no counts, no sharing.
const db = require('./dynamoDb');
const getCurentUserFromToken = require('./auth').getCurentUserFromToken;

const TABLE = 'dictionary_word_source_votes';

// Words are keyed the same way the dictionary stores/searches them.
const normalize = (word) => (word || '').trim().toLowerCase();

function getSourceVotes(userIdToken, word) {
    return new Promise((resolve) => {
        const w = normalize(word);
        if (!userIdToken || !w) return resolve({});
        getCurentUserFromToken(userIdToken).then((userName) => {
            db.dynamoDbClientInstance().get(
                { TableName: TABLE, Key: { user_name: userName, word: w } },
                (err, data) => {
                    if (err) {
                        console.log('getSourceVotes error:', err.name || err);
                        return resolve({});
                    }
                    resolve(data && data.Item && data.Item.votes ? data.Item.votes : {});
                }
            );
        }).catch(() => resolve({}));
    });
}

// Set (vote = 1 | -1) or clear (vote = 0) the thumb for one source, by reading
// the small votes map, changing one key, and writing it back. Returns the map.
function setSourceVote(userIdToken, word, source, vote) {
    return new Promise((resolve, reject) => {
        const w = normalize(word);
        if (!userIdToken || !w || !source) return resolve({});
        getCurentUserFromToken(userIdToken).then((userName) => {
            const key = { TableName: TABLE, Key: { user_name: userName, word: w } };
            db.dynamoDbClientInstance().get(key, (err, data) => {
                if (err) return reject(err);
                const votes = (data && data.Item && data.Item.votes) ? { ...data.Item.votes } : {};
                if (vote === 1 || vote === -1) votes[source] = vote;
                else delete votes[source];
                db.dynamoDbClientInstance().put(
                    {
                        TableName: TABLE,
                        Item: { user_name: userName, word: w, votes, updated_at: new Date().toISOString() },
                    },
                    (putErr) => (putErr ? reject(putErr) : resolve(votes))
                );
            });
        }).catch(reject);
    });
}

module.exports = { getSourceVotes, setSourceVote };
