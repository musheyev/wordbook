import { ADD_WORDBOOK, DELETE_WORDBOOK, FETCH_WORDBOOKS } from '../actions';

export default (state = [], action) => {
    switch (action.type) {
        case ADD_WORDBOOK:
            return action.payload.data;
        case DELETE_WORDBOOK:
            return [...action.payload.data];
        case FETCH_WORDBOOKS:
            return action.payload.data;
        default:
            return state;
    }
}