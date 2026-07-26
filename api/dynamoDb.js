// AWS SDK v3 DynamoDB access, exposed through a small compatibility adapter.
//
// The rest of the codebase was written against the AWS SDK v2 DocumentClient,
// which supported two call styles:
//     docClient.put(params, (err, data) => {})       // node callback
//     docClient.put(params).promise().then(...)        // promise
// The v3 client only speaks docClient.send(new PutCommand(params)) and returns
// a promise. This adapter re-exposes the v2-style surface on top of v3 so the
// existing (intricate) call sites keep working unchanged, while the underlying
// library is fully modern. Response shapes (.Item / .Items) are identical
// because @aws-sdk/lib-dynamodb performs the same plain-JS marshalling.
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    DeleteCommand,
    UpdateCommand,
    BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const COMMANDS = {
    get: GetCommand,
    put: PutCommand,
    query: QueryCommand,
    delete: DeleteCommand,
    update: UpdateCommand,
    batchWrite: BatchWriteCommand,
};

let adapter = null;

function buildAdapter() {
    const client = new DynamoDBClient({
        region: process.env.AWS_REGION || "us-east-1",
    });
    const doc = DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true },
    });

    const api = {};
    for (const [name, Command] of Object.entries(COMMANDS)) {
        api[name] = (params, callback) => {
            const promise = doc.send(new Command(params));

            if (typeof callback === "function") {
                promise.then(
                    (data) => callback(null, data),
                    (err) => callback(err)
                );
                return undefined;
            }

            // v2-style: caller invokes .promise()
            return { promise: () => promise };
        };
    }
    return api;
}

function dynamoDbClientInstance() {
    if (adapter == null) {
        adapter = buildAdapter();
    }
    return adapter;
}

module.exports = {
    dynamoDbClientInstance,
};
