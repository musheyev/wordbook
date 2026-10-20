/**
 * The nightly account clean-up, as its own Lambda function (separate from the
 * API's lambda.js). AWS EventBridge starts it once a day
 * (infra/lib/wordbook-stack.ts, "AccountPurge"); it deletes the accounts
 * whose 7-day grace period is over (account.js purgeDueAccounts).
 *
 * A Lambda "handler" is the function AWS calls with an event: here a timer
 * event, which isn't needed. What it returns shows in the Lambda's logs.
 */
require("dotenv").config();
const { purgeDueAccounts } = require("./account");

exports.handler = async () => purgeDueAccounts();
