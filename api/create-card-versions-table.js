// One-off: create the `dictionary_card_versions` table that holds note
// history (card-versions.js). Safe to run again: it creates only what's
// missing.
//
//   node create-card-versions-table.js
//
// It also turns on, for this table:
//   - TTL ("time to live") on `expires_at`: DynamoDB deletes each version by
//     itself once that time has passed (30 days after it was kept), free.
//   - Point-in-time recovery, the same backup as the other data tables
//     (enable-backups.js).
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    UpdateTimeToLiveCommand,
    DescribeTimeToLiveCommand,
    UpdateContinuousBackupsCommand,
    waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = "dictionary_card_versions";

const client = new DynamoDBClient({ region: REGION });

async function main() {
    try {
        await client.send(new DescribeTableCommand({ TableName: TABLE }));
        console.log(`Table "${TABLE}" already exists.`);
    } catch (err) {
        if (err.name !== "ResourceNotFoundException") throw err;
        await client.send(new CreateTableCommand({
            TableName: TABLE,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "user_name", AttributeType: "S" },
                { AttributeName: "version_key", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "user_name", KeyType: "HASH" },
                { AttributeName: "version_key", KeyType: "RANGE" },
            ],
        }));
        console.log(`Created table "${TABLE}"; waiting for it to be ready…`);
        await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLE });
    }

    const ttl = await client.send(new DescribeTimeToLiveCommand({ TableName: TABLE }));
    const status = ttl.TimeToLiveDescription && ttl.TimeToLiveDescription.TimeToLiveStatus;
    if (status === "ENABLED" || status === "ENABLING") {
        console.log(`TTL already ${status.toLowerCase()}.`);
    } else {
        await client.send(new UpdateTimeToLiveCommand({
            TableName: TABLE,
            TimeToLiveSpecification: { AttributeName: "expires_at", Enabled: true },
        }));
        console.log("TTL turned on (expires_at).");
    }

    await client.send(new UpdateContinuousBackupsCommand({
        TableName: TABLE,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    }));
    console.log("Point-in-time recovery turned on.");
}

main().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
});
