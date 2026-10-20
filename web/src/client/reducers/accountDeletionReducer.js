import { FETCH_CURRENT_USER, LOGOUT_CURRENT_USER, ACCOUNT_KEPT } from '../actions';

// When the signed-in account is due to be deleted (ISO time), or null: it's
// waiting out the 7-day grace period after Delete account (api/account.js).
// From /auth/current_user's `deletionDueAt`. While set, App shows
// components/PendingDeletion.js instead of the app.
export default (state = null, action) => {
    switch (action.type) {
        case FETCH_CURRENT_USER: {
            const data = action.payload && action.payload.data;
            return (data && typeof data === 'object' && data.deletionDueAt) || null;
        }
        case ACCOUNT_KEPT:
        case LOGOUT_CURRENT_USER:
            return null;
        default:
            return state;
    }
};
