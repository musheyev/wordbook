// One-off: create the `dictionary_inbox` DynamoDB table used by sharing
// (api/inbox.js). Safe to run more than once; it no-ops if the table exists.
//
//   node create-inbox-table.js
//
// Requires the same AWS credentials/region as the app (reads .env).
//
// Key design (DynamoDB tables are defined only by their keys; every other
// attribute is free-form per item):
//   user_name (partition key)  Whose inbox the row is in. All of one user's
//                              inbox lives in one partition, so listing it is
//                              a single, cheap Query.
//   inbox_id  (sort key)       "<ISO time>#<uuid>". DynamoDB keeps rows sorted
//                              by sort key, and ISO timestamps sort as text in
//                              time order, so the inbox comes back in date
//                              order without a separate index.
require("dotenv").config();
const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = "dictionary_inbox";

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
            // Pay per request: no capacity to plan, and near-zero cost at
            // this app's traffic.
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "user_name", AttributeType: "S" },
                { AttributeName: "inbox_id", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "user_name", KeyType: "HASH" },
                { AttributeName: "inbox_id", KeyType: "RANGE" },
            ],
        })
    );

    console.log(`Created table "${TABLE}" in ${REGION}.`);
}

main().catch((err) => {
    console.error("Failed to create table:", err);
    process.exit(1);
});
