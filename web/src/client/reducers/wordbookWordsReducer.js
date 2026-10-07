import {
    ADD_WORDBOOK_WORD, DELETE_WORDBOOK_WORD, FETCH_WORDBOOK_WORDS, FETCH_WORDBOOK_WORDS_IN_PROGRESS,
    FETCH_WORDBOOK_WORDS_FAILED,
} from '../actions';

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

// Which notebook the list in wordbookWords belongs to (null until one loads).
export const wordbookWordsForReducer = (state = null, action) => {
    switch (action.type) {
        case FETCH_WORDBOOK_WORDS:
            return action.wordbook || state;
        default:
            return state;
    }
}

// The last failed load: { wordbook, message }. Cleared when a new load starts
// or one succeeds.
export const wordbookWordsErrorReducer = (state = null, action) => {
    switch (action.type) {
        case FETCH_WORDBOOK_WORDS_FAILED:
            return action.payload;
        case FETCH_WORDBOOK_WORDS:
            return null;
        case FETCH_WORDBOOK_WORDS_IN_PROGRESS:
            return action.payload ? null : state; // a load starting
        default:
            return state;
    }
}
