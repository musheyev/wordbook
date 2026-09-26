import { FETCH_INBOX, LOGOUT_CURRENT_USER } from '../actions';

// The signed-in user's inbox list: [{ id, type, title, preview, from, sharedAt }],
// newest first. `null` means "not loaded yet", so pages can tell an empty
// inbox apart from one that's still loading.
export default (state = null, action) => {
    switch (action.type) {
        case FETCH_INBOX:
            return Array.isArray(action.payload) ? action.payload : [];
        case LOGOUT_CURRENT_USER:
            return null;
        default:
            return state;
    }
};
