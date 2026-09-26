// One-off repair for notebooks renamed before the rename fix.
//
// The old rename copied membership rows without `item_type`/`card_id`, so every
// note (card) in a renamed notebook turned into a "word" whose text is the
// card's GUID. The card content itself was never touched (it lives in
// dictionary_cards), so restoring those two attributes brings the notes back.
//
// A row is repaired only when it has no item_type, its `word` looks like a GUID,
// and a card with that id exists for the same user.
//
// Usage (from api/, with AWS credentials in .env or the environment):
//   node repair-renamed-cards.js            # dry run: lists what would change
//   node repair-renamed-cards.js --apply    # writes the fix
require("dotenv").config();

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    ScanCommand,
    GetCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const APPLY = process.argv.includes("--apply");
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const doc = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" })
);

async function main() {
    let lastKey;
    let candidates = 0;
    let repaired = 0;

    do {
        const page = await doc.send(new ScanCommand({
            TableName: "dictionary_wordbooks_words",
            FilterExpression: "attribute_not_exists(item_type)",
            ExclusiveStartKey: lastKey,
        }));
        lastKey = page.LastEvaluatedKey;

        for (const row of page.Items || []) {
            if (!GUID.test(row.word || "")) continue;
            candidates++;

            const card = await doc.send(new GetCommand({
                TableName: "dictionary_cards",
                Key: { user_name: row.user_name, card_id: row.word },
                ProjectionExpression: "card_id, #title",
                ExpressionAttributeNames: { "#title": "title" },
            }));
            if (!card.Item) {
                console.log(`skip (no such card): ${row.user_name} ${row.wordbook_name}`);
                continue;
            }

            console.log(`${APPLY ? "repair" : "would repair"}: ${row.user_name} ${row.wordbook_name} -> "${card.Item.title}"`);
            if (APPLY) {
                await doc.send(new UpdateCommand({
                    TableName: "dictionary_wordbooks_words",
                    Key: { user_name: row.user_name, wordbook_name: row.wordbook_name },
                    UpdateExpression: "set item_type = :card, card_id = :id",
                    ExpressionAttributeValues: { ":card": "card", ":id": row.word },
                }));
            }
            repaired++;
        }
    } while (lastKey);

    console.log(`\n${candidates} GUID-looking word rows, ${repaired} ${APPLY ? "repaired" : "repairable"}.`);
    if (!APPLY && repaired > 0) {
        console.log("Run again with --apply to write the fix.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
