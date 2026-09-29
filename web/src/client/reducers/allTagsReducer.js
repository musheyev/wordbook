import { SET_ALL_TAGS } from '../actions';

// Every tagged item for the user: [{ type, id, title, tags }].
export default (state = null, action) => {
    switch (action.type) {
        case SET_ALL_TAGS:
            return action.payload;
        default:
            return state;
    }
};
