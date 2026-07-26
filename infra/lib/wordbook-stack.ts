import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as certmgr from 'aws-cdk-lib/aws-certificatemanager';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

/**
 * The DynamoDB tables the API reads/writes. These ALREADY EXIST in the account
 * (they hold your data), so this stack does NOT create them — it only grants the
 * Lambda permission to use them. The table names are hard-coded in the API code,
 * so they're hard-coded here too.
 */
const DYNAMO_TABLES = [
  'dictionary',
  'dictionary_wordbook',
  'dictionary_wordbooks_words',
  'dictionary_user_word_history',
  'dictionary_images',
  'dictionary_examples',
];

export class WordbookStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // Optional custom domain (e.g. apps.musheye.com).
    //   Pass with:  cdk deploy -c domainName=apps.musheye.com -c certArn=arn:aws:acm:us-east-1:...:certificate/xxxx
    //   The ACM certificate MUST be in us-east-1 (CloudFront requirement).
    //   If omitted, the app is served on the generated *.cloudfront.net domain.
    // APP_URL is the public URL the auth flow redirects to. Set it (in api/.env
    // as APP_URL, or `-c appUrl=`) to your real URL once you know it, otherwise
    // the Cognito login redirect stays pointed at localhost.
    // -------------------------------------------------------------------------
    const domainName = this.node.tryGetContext('domainName') as string | undefined;
    const certArn = this.node.tryGetContext('certArn') as string | undefined;
    const appUrl =
      (process.env.APP_URL as string | undefined) ||
      (this.node.tryGetContext('appUrl') as string | undefined) ||
      (domainName ? `https://${domainName}` : undefined);

    // =========================================================================
    // 1. LAMBDA — your Express API, wrapped by serverless-http (api/lambda.js).
    //    We deploy the api folder as-is (its handler is "lambda.handler"),
    //    excluding things the Lambda doesn't need:
    //      - node_modules/@aws-sdk/**  → the Node 22 runtime already ships it
    //      - .env                      → secrets are passed as env vars below
    //      - tests / docs              → not needed at runtime
    //    Run `npm install` in ../api before deploying so node_modules is present.
    // =========================================================================
    const apiRoot = path.join(__dirname, '..', '..', 'api');
    const apiFn = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'lambda.handler',
      code: lambda.Code.fromAsset(apiRoot, {
        exclude: [
          'node_modules/@aws-sdk/**',
          'node_modules/.cache/**',
          '.env',
          '.env.example',
          '.git/**',
          'tests/**',
          '.vscode/**',
          'Dockerfile',
          '*.md',
          'example_DynamoDb_bulk_delete.js',
        ],
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        // Same values as your local api/.env (loaded in bin/wordbook.ts).
        // NOTE: AWS_REGION is a reserved Lambda variable and is set automatically
        // by the runtime, so dynamoDb.js picks up the region without us passing it.
        COGNITO_REGION: process.env.COGNITO_REGION ?? 'us-east-1',
        COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ?? '',
        COGNITO_DOMAIN: process.env.COGNITO_DOMAIN ?? '',
        COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? '',
        COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET ?? '',
        WORDNIK_API_KEY: process.env.WORDNIK_API_KEY ?? '',
        GOOGLE_SEARCH_KEY: process.env.GOOGLE_SEARCH_KEY ?? '',
        GOOGLE_SEARCH_CX: process.env.GOOGLE_SEARCH_CX ?? '',
        GOOGLE_TRANSLATE_KEY: process.env.GOOGLE_TRANSLATE_KEY ?? '',
        // Public URLs used by the Cognito auth redirect flow. Only correct once
        // APP_URL is known; harmless for the (non-auth) dictionary/wordbook APIs.
        ...(appUrl ? { FRONTEND_URL: appUrl, BACKEND_URL: `${appUrl}/api` } : {}),
      },
    });

    // Grant the Lambda access to the existing DynamoDB tables (and their indexes).
    // We build the ARNs by hand because the tables aren't defined in this stack.
    const tableArns = DYNAMO_TABLES.flatMap((name) => [
      `arn:aws:dynamodb:${this.region}:${this.account}:table/${name}`,
      `arn:aws:dynamodb:${this.region}:${this.account}:table/${name}/index/*`,
    ]);
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: tableArns,
      })
    );

    // =========================================================================
    // 2. HTTP API GATEWAY — the front door to the Lambda.
    //    `defaultIntegration` makes it a catch-all: every method/path is proxied
    //    to the Lambda, which is exactly what a single Express app wants.
    // =========================================================================
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'wordbook-api',
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', apiFn),
    });

    // apiEndpoint looks like "https://abc123.execute-api.us-east-1.amazonaws.com";
    // CloudFront's HttpOrigin needs just the host, so strip the scheme.
    const apiDomain = cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint));

    // =========================================================================
    // 3. S3 BUCKET — holds the built SPA (web/dist). Private; only CloudFront can
    //    read it, via Origin Access Control (OAC). No public bucket access.
    // =========================================================================
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Dev-friendly: deleting the stack removes the bucket + its objects.
      // For production data you'd switch this to RETAIN.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // =========================================================================
    // 4. CLOUDFRONT FUNCTION — runs at the edge on every /api/* request and
    //    strips the leading "/api" before the request reaches API Gateway.
    //    This mirrors the Vite dev proxy's rewrite, so the Express routes
    //    (/dictionary, /wordbook, /auth) match in both environments.
    // =========================================================================
    const stripApiPrefix = new cloudfront.Function(this, 'StripApiPrefix', {
      comment: 'Remove the /api prefix before forwarding to API Gateway',
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  if (request.uri.startsWith('/api')) {
    request.uri = request.uri.substring(4);
    if (request.uri === '') { request.uri = '/'; }
  }
  return request;
}`),
    });

    // =========================================================================
    // 5. CLOUDFRONT DISTRIBUTION — one global CDN, two origins, one domain:
    //      default  ("/*")     -> S3 bucket (the SPA)
    //      "/api/*"            -> API Gateway (the Lambda)
    //    Because both live under the same CloudFront domain, the httpOnly auth
    //    cookie is same-origin and "just works". CloudFront terminates TLS at
    //    the edge closest to each user, which is what makes it fast worldwide.
    // =========================================================================
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Wordbook SPA + API',
      defaultRootObject: 'index.html',

      // Static SPA from S3, cached aggressively at the edge.
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },

      additionalBehaviors: {
        // Dynamic API: never cached, all HTTP methods allowed, and forward the
        // viewer's cookies/query/headers (EXCEPT Host, which API Gateway rejects).
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            {
              function: stripApiPrefix,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },

      // SPA deep-link support: S3 returns 403 for unknown keys (OAC grants read
      // only), so serve index.html and let React Router handle the path.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
      ],

      // Optional custom domain (only if both context values were supplied).
      ...(domainName && certArn
        ? {
            domainNames: [domainName],
            certificate: certmgr.Certificate.fromCertificateArn(this, 'SiteCert', certArn),
          }
        : {}),
    });

    // =========================================================================
    // 6. DEPLOY THE SPA — upload web/dist to the bucket and invalidate the CDN
    //    cache so the new build is served immediately.
    //    (Run `npm run build` in ../web first, or `cdk deploy` will fail here.)
    // =========================================================================
    new s3deploy.BucketDeployment(this, 'DeploySpa', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'web', 'dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // -------------------------------------------------------------------------
    // Outputs — printed after `cdk deploy` so you know the URLs.
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Public URL of the app (SPA + /api)',
    });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.apiEndpoint,
      description: 'Direct API Gateway endpoint (bypasses CloudFront; for debugging)',
    });
    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket that holds the SPA build',
    });
  }
}
