// One-off: create the two DynamoDB tables used by user-added word images and
// the admin image-search switch. Safe to run more than once; existing tables
// are left alone.
//
//   dictionary_user_word_images  PK user_name, SK word  (user-word-images.js)
//   dictionary_app_settings      PK setting_id          (app-settings.js)
//
//   node create-word-image-tables.js
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
        TableName: "dictionary_user_word_images",
        AttributeDefinitions: [
            { AttributeName: "user_name", AttributeType: "S" },
            { AttributeName: "word", AttributeType: "S" },
        ],
        KeySchema: [
            { AttributeName: "user_name", KeyType: "HASH" },
            { AttributeName: "word", KeyType: "RANGE" },
        ],
    },
    {
        TableName: "dictionary_app_settings",
        AttributeDefinitions: [{ AttributeName: "setting_id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "setting_id", KeyType: "HASH" }],
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
