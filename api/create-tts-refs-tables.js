// One-off: create the two DynamoDB tables that track which read-aloud audio
// each item uses (tts-refs.js). Safe to run more than once; existing tables
// are left alone.
//
//   dictionary_tts_refs      PK item_key, SK user_name
//   dictionary_tts_released  PK audio_key
//
//   node create-tts-refs-tables.js
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";
const client = new DynamoDBClient({ region: REGION });

const TABLES = [
    {
        TableName: "dictionary_tts_refs",
        AttributeDefinitions: [
            { AttributeName: "item_key", AttributeType: "S" },
            { AttributeName: "user_name", AttributeType: "S" },
        ],
        KeySchema: [
            { AttributeName: "item_key", KeyType: "HASH" },
            { AttributeName: "user_name", KeyType: "RANGE" },
        ],
    },
    {
        TableName: "dictionary_tts_released",
        AttributeDefinitions: [{ AttributeName: "audio_key", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "audio_key", KeyType: "HASH" }],
    },
];

async function exists(TableName) {
    try {
        await client.send(new DescribeTableCommand({ TableName }));
        return true;
    } catch (err) {
        if (err.name === "ResourceNotFoundException") return false;
        throw err;
    }
}

async function main() {
    for (const table of TABLES) {
        if (await exists(table.TableName)) {
            console.log(`Table "${table.TableName}" already exists in ${REGION}. Nothing to do.`);
            continue;
        }
        await client.send(new CreateTableCommand({ ...table, BillingMode: "PAY_PER_REQUEST" }));
        console.log(`Created table "${table.TableName}" in ${REGION}.`);
    }
}

main().catch((err) => {
    console.error("Failed to create tables:", err);
    process.exit(1);
});
