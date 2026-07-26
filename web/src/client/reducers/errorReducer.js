import { ADD_WORDBOOK_ERROR_MESSAGE, ADD_WORDBOOK_CLEAR_ERROR_MESSAGE, 
    ADD_WORDBOOK_WORD_ERROR_MESSAGE, ADD_WORDBOOK_WORD_CLEAR_ERROR_MESSAGE } from '../actions';

export default (state = [], action) => {
    switch (action.type) {
        case ADD_WORDBOOK_ERROR_MESSAGE:
        case ADD_WORDBOOK_WORD_ERROR_MESSAGE:
            return action.payload;
        case ADD_WORDBOOK_CLEAR_ERROR_MESSAGE:
        case ADD_WORDBOOK_WORD_CLEAR_ERROR_MESSAGE:

            return "";
        
        default:
            return state;
    }
}