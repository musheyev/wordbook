// One-off: create the `dictionary_note_links` DynamoDB table used by note
// links (note-links.js). Safe to run once; it no-ops if the table already exists.
//
//   node create-note-links-table.js
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = "dictionary_note_links";

const client = new DynamoDBClient({ region: REGION });

async function main() {
    try {
        await client.send(new DescribeTableCommand({ TableName: TABLE }));
        console.log(`Table "${TABLE}" already exists in ${REGION}. Nothing to do.`);
        return;
    } catch (err) {
        if (err.name !== "ResourceNotFoundException") {
            throw err;
        }
    }

    await client.send(
        new CreateTableCommand({
            TableName: TABLE,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "user_name", AttributeType: "S" },
                { AttributeName: "link_key", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "user_name", KeyType: "HASH" },
                { AttributeName: "link_key", KeyType: "RANGE" },
            ],
        })
    );

    console.log(`Created table "${TABLE}" in ${REGION}.`);
}

main().catch((err) => {
    console.error("Failed to create table:", err);
    process.exit(1);
});
