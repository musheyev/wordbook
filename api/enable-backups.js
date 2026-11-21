// One-off: turn on point-in-time recovery (PITR) for the tables that hold
// what people write and set up. Safe to run again.
//
//   node enable-backups.js           turn it on, then show each table's state
//   node enable-backups.js --check   only show each table's state
//
// What PITR is: DynamoDB keeps a continuous backup of the table, and can
// rebuild it as it was at any second of the last 35 days. A rebuild makes a
// NEW table (the original is left alone); the data is then copied back from
// it. It's for something going wrong with many notes at once (a bad update,
// a mass delete). Single notes have their own 30-day history
// (card-versions.js), which people use themselves from a note.
//
// Cost: about $0.20 per GB per month of the tables' size. These tables were
// under 3 MB together in November 2026, so a fraction of a cent a month.
//
// Left out on purpose: caches the app can fetch or make again (dictionary
// definitions, examples, images, read-aloud audio bookkeeping).
//
// Requires the same AWS credentials/region as the app (reads .env).
require("dotenv").config();
const {
    DynamoDBClient,
    UpdateContinuousBackupsCommand,
    DescribeContinuousBackupsCommand,
} = require("@aws-sdk/client-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";

const TABLES = [
    "dictionary_cards",               // notes
    "dictionary_card_versions",       // notes' history
    "dictionary_wordbook",            // notebooks
    "dictionary_wordbooks_words",     // what's in each notebook
    "dictionary_word_notes",          // notes on words
    "dictionary_item_tags",           // tags
    "dictionary_note_links",          // links between notes
    "dictionary_quizzes",             // saved quizzes
    "dictionary_user_settings",       // sorts, colours, bookmarks, recent notes
    "dictionary_user_word_images",    // pictures added to words
    "dictionary_word_source_votes",   // thumbs on dictionary sources
    "dictionary_user_word_history",   // words looked up
    "dictionary_inbox",               // shared items
    "dictionary_classrooms",          // classrooms
    "dictionary_teachers",            // teacher accounts
    "dictionary_app_settings",        // admin settings
    "dictionary_unsubscribed",        // word-of-the-day opt-outs
];

const client = new DynamoDBClient({ region: REGION });

async function main() {
    const checkOnly = process.argv.includes("--check");
    for (const table of TABLES) {
        try {
            if (!checkOnly) {
                await client.send(new UpdateContinuousBackupsCommand({
                    TableName: table,
                    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
                }));
            }
            const out = await client.send(new DescribeContinuousBackupsCommand({ TableName: table }));
            const pitr = out.ContinuousBackupsDescription.PointInTimeRecoveryDescription || {};
            console.log(`${table.padEnd(32)} ${pitr.PointInTimeRecoveryStatus}`
                + (pitr.RecoveryPeriodInDays ? `, ${pitr.RecoveryPeriodInDays} days` : ""));
        } catch (err) {
            console.log(`${table.padEnd(32)} ${err.name}: ${err.message}`);
        }
    }
}

main().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
});
