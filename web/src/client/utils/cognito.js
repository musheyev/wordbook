// Cognito Hosted UI login/signup URLs, with an environment-aware redirect_uri.
//
// The redirect_uri is where Cognito sends the browser back after auth; it must
// exactly match a callback URL registered on the app client. It differs by
// environment:
//   dev  -> http://localhost:4000/auth      (the backend serves /auth directly)
//   prod -> https://<this-origin>/api/auth   (CloudFront routes /api/* to the API,
//                                             stripping /api, so it hits /auth)
// The backend derives its own matching redirect from BACKEND_URL, so only the
// frontend needs this branch.
export const COGNITO_DOMAIN = 'https://auth.musheye.com';
export const CLIENT_ID = '31i8vt5m567ch5ciedmeskpk67';
export const SCOPE = 'aws.cognito.signin.user.admin+email+openid+profile';

function redirectUri() {
    const origin =
        (typeof window !== 'undefined' && window.location && window.location.origin) || '';
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return 'http://localhost:4000/auth';
    }
    return `${origin}/api/auth`;
}

function buildUrl(action) {
    // NOTE: redirect_uri is sent RAW (not percent-encoded), matching the format
    // Cognito's classic /login hosted UI expects. Encoding it makes Cognito fail
    // to match the registered callback and return error=unauthorized_client.
    return (
        `${COGNITO_DOMAIN}/${action}?client_id=${CLIENT_ID}` +
        `&response_type=code&scope=${SCOPE}` +
        `&redirect_uri=${redirectUri()}`
    );
}

export const COGNITO_LOGIN = buildUrl('login');

// Sign in again to confirm deleting the account (components/DeleteAccount.js):
// Cognito's /logout, given a response_type and redirect_uri, first forgets
// Cognito's own remembered sign-in and then shows the sign-in page, so the
// password must be typed. The server's GET /auth sees the `state` (starting
// "delete-") and hands the code back to the page instead of signing in.
export const reauthUrl = (state) => (
    `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}`
    + `&response_type=code&scope=${SCOPE}`
    + `&redirect_uri=${redirectUri()}&state=${state}`
);
export const COGNITO_SIGNUP = buildUrl('signup');
