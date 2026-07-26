import { ADD_WORDBOOK_WORD, DELETE_WORDBOOK_WORD, FETCH_WORDBOOK_WORDS, FETCH_WORDBOOK_WORDS_IN_PROGRESS } from '../actions';

export default (state = [], action) => {
    switch (action.type) {
        case ADD_WORDBOOK_WORD:
            return action.payload.data;
        case DELETE_WORDBOOK_WORD:
            return action.payload.data;
        case FETCH_WORDBOOK_WORDS:
                return action.payload.data;
        default:
            return state;
    }
}

export const wordbookWordsInProgressReducer = (state = false, action) => {
    switch (action.type) {
        case FETCH_WORDBOOK_WORDS_IN_PROGRESS:
            return action.payload;
        default:
            return state;
    }
}