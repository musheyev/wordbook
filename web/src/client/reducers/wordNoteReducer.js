import { SET_WORD_NOTE } from '../actions';

// The current word's personal note: { word, content }. `word` lets the view
// ignore a note that belongs to a previously-selected word.
const initialState = { word: '', content: null };

export default (state = initialState, action) => {
    switch (action.type) {
        case SET_WORD_NOTE:
            return { word: action.payload.word, content: action.payload.content };
        default:
            return state;
    }
};
