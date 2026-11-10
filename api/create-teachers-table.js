// One-off: create the `dictionary_teachers` DynamoDB table used by teacher
// accounts (teachers.js). Safe to run once; it no-ops if the table already
// exists.
//
//   node create-teachers-table.js
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = "dictionary_teachers";

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

    // One row per user: the key is just the username.
    await client.send(
        new CreateTableCommand({
            TableName: TABLE,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "user_name", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "user_name", KeyType: "HASH" },
            ],
        })
    );

    console.log(`Created table "${TABLE}" in ${REGION}.`);
}

main().catch((err) => {
    console.error("Failed to create table:", err);
    process.exit(1);
});
