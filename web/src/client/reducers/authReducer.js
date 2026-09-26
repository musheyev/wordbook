import { FETCH_CURRENT_USER, LOGOUT_CURRENT_USER } from '../actions';

export default (state = null, action) => {
    switch (action.type) {
        case FETCH_CURRENT_USER: {
            // /current_user now returns { username, isAdmin }. Keep `auth` the
            // username string (or false when signed out) as the rest of the app
            // expects.
            const data = action.payload.data;
            const username = data && typeof data === 'object' ? data.username : data;
            return username || false;
        }
        case LOGOUT_CURRENT_USER:
                return "";
        default:
            return state;
    }
}