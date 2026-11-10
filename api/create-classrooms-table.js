// One-off: create the `dictionary_classrooms` DynamoDB table used by
// classrooms (classrooms.js). Safe to run once; it no-ops if the table
// already exists.
//
//   node create-classrooms-table.js
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = "dictionary_classrooms";

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

    // One partition per classroom (its meta, member and item rows, told apart
    // by sk), and an index by user_name for "My Classrooms" (see classrooms.js).
    await client.send(
        new CreateTableCommand({
            TableName: TABLE,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "classroom_id", AttributeType: "S" },
                { AttributeName: "sk", AttributeType: "S" },
                { AttributeName: "user_name", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "classroom_id", KeyType: "HASH" },
                { AttributeName: "sk", KeyType: "RANGE" },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: "by-user",
                    KeySchema: [
                        { AttributeName: "user_name", KeyType: "HASH" },
                        { AttributeName: "classroom_id", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
            ],
        })
    );

    console.log(`Created table "${TABLE}" in ${REGION}.`);
}

main().catch((err) => {
    console.error("Failed to create table:", err);
    process.exit(1);
});
