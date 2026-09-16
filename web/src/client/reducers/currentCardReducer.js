import { FETCH_CARD_DATA } from '../actions';

// Holds the currently selected card's content ({ card_id, title, content }) or
// null when the current selection is a dictionary word rather than a card.
export default (state = null, action) => {
    switch (action.type) {
        case FETCH_CARD_DATA:
            return action.payload;
        default:
            return state;
    }
};
