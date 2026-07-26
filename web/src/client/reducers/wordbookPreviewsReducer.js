import { FETCH_WORDBOOK_PREVIEWS } from '../actions';

export default (state = {}, action) => {
    switch (action.type) {
        case FETCH_WORDBOOK_PREVIEWS:
            return action.payload.data;
        default:
            return state;
    }
}
