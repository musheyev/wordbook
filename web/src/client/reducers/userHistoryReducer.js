import { FETCH_USER_HISTORY, PROMOTE_HISTORY_WORD } from '../actions';

export default (state = [], action) => {
    switch (action.type) {
        case FETCH_USER_HISTORY:
            return action.payload.data;
        case PROMOTE_HISTORY_WORD: {
            // Move (or add) the searched word to the front, de-duped.
            const word = action.payload;
            if (!word) return state;
            const rest = (Array.isArray(state) ? state : []).filter((w) => w !== word);
            return [word, ...rest];
        }
        default:
            return state;
    }
}