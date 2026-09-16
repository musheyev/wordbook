import { SET_CURRENT_WORD_TYPE } from '../actions';

// "word" when the current selection is a dictionary word, "card" when it is a
// manual card. Drives which view SearchResult renders and how add-to-wordbook
// and delete behave.
export default (state = 'word', action) => {
    switch (action.type) {
        case SET_CURRENT_WORD_TYPE:
            return action.payload;
        default:
            return state;
    }
};
