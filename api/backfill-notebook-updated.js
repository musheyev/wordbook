// One-off: give existing notebooks an `updated_datetime` for the "Recently
// updated" sort on My Notebooks. From now on the app sets it whenever a note
// is added to a notebook or a note in it is edited (wordbook.js
// _touchWordbook); this fills it in for notebooks from before that.
//
// For each notebook without one, it uses the latest of: when each of its
// notes was added to it, and when each of those notes was last edited.
// Notebooks with no notes are left alone; the app falls back to when they
// were created.
//
//   node backfill-notebook-updated.js           preview, writes nothing
//   node backfill-notebook-updated.js --write   save the times
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const database = require("./dynamoDb");

const WRITE = process.argv.includes("--write");
const db = database.dynamoDbClientInstance();

async function scanAll(params) {
    const items = [];
    let key;
    do {
        const page = await db.scan({ ...params, ExclusiveStartKey: key }).promise();
        items.push(...(page.Items || []));
        key = page.LastEvaluatedKey;
    } while (key);
    return items;
}

async function queryAll(params) {
    const items = [];
    let key;
    do {
        const page = await db.query({ ...params, ExclusiveStartKey: key }).promise();
        items.push(...(page.Items || []));
        key = page.LastEvaluatedKey;
    } while (key);
    return items;
}

const latest = (a, b) => (!a || (b && b > a) ? b : a);

async function main() {
    const notebooks = await scanAll({ TableName: "dictionary_wordbook" });
    let filled = 0;
    let skippedHasTime = 0;
    let skippedNoNotes = 0;

    for (const nb of notebooks) {
        if (nb.updated_datetime) {
            skippedHasTime++;
            continue;
        }
        const prefix = nb.wordbook_name + "#";
        const rows = await queryAll({
            TableName: "dictionary_wordbooks_words",
            KeyConditionExpression: "user_name = :u AND begins_with(wordbook_name, :p)",
            ExpressionAttributeValues: { ":u": nb.user_name, ":p": prefix },
        });
        // begins_with also matches a notebook whose name starts with this one
        // plus "#"; names can't contain "#", so an exact prefix is enough.
        const noteRows = rows.filter((r) => r.item_type === "card");
        if (noteRows.length === 0) {
            skippedNoNotes++;
            continue;
        }

        let updated = null;
        for (const row of noteRows) {
            updated = latest(updated, row.added_datetime);
            const card = await db.get({
                TableName: "dictionary_cards",
                Key: { user_name: nb.user_name, card_id: row.card_id || row.word },
                ProjectionExpression: "updated_datetime",
            }).promise();
            updated = latest(updated, card.Item && card.Item.updated_datetime);
        }
        if (!updated) {
            skippedNoNotes++;
            continue;
        }

        console.log(`${WRITE ? "set " : "would set"} ${nb.user_name} / "${nb.wordbook_name}" -> ${updated}`);
        if (WRITE) {
            await db.update({
                TableName: "dictionary_wordbook",
                Key: { user_name: nb.user_name, wordbook_name: nb.wordbook_name },
                ConditionExpression: "attribute_exists(wordbook_name) AND attribute_not_exists(updated_datetime)",
                UpdateExpression: "SET updated_datetime = :t",
                ExpressionAttributeValues: { ":t": updated },
            }).promise().catch((err) => {
                if (err.name !== "ConditionalCheckFailedException") throw err;
            });
        }
        filled++;
    }

    console.log(`\n${notebooks.length} notebooks: ${filled} ${WRITE ? "filled in" : "to fill in"}, ` +
        `${skippedHasTime} already had a time, ${skippedNoNotes} have no notes (use their created time).`);
    if (!WRITE) console.log("Preview only. Run with --write to save.");
}

main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
