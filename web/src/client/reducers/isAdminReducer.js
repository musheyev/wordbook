import { FETCH_CURRENT_USER, LOGOUT_CURRENT_USER } from '../actions';

// Whether the current user is in the Cognito "admins" group. Set from the same
// /current_user response that populates auth.
export default (state = false, action) => {
    switch (action.type) {
        case FETCH_CURRENT_USER: {
            const data = action.payload.data;
            return !!(data && typeof data === 'object' && data.isAdmin);
        }
        case LOGOUT_CURRENT_USER:
            return false;
        default:
            return state;
    }
};
