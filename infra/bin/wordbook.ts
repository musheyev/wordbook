#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { WordbookStack } from '../lib/wordbook-stack';

// Load the API's local .env so the Lambda is deployed with the SAME config/secrets
// you already use for local development (Cognito, Wordnik, Google keys, etc.).
// One source of truth for both local and deployed environments.
dotenv.config({ path: path.join(__dirname, '..', '..', 'api', '.env') });

const app = new cdk.App();

new WordbookStack(app, 'WordbookStack', {
  // CloudFront + ACM certs live in us-east-1, and the DynamoDB tables are in
  // us-east-1, so we deploy there. CDK_DEFAULT_* come from your AWS CLI profile.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Wordbook: static SPA (S3+CloudFront) + Express API (Lambda) over existing DynamoDB',
});
