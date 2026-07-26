import { SET_CURRENT_WORDBOOK } from '../actions';

export default (state = "", action) => {
    switch (action.type) {
        case SET_CURRENT_WORDBOOK:
            return action.payload;
        default:
            return state;
    }
}