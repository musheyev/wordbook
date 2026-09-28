import { FETCH_WORD_DATA, SET_WORD_IMAGES } from '../actions';

// The looked-up word's data: { definitions, images, examples }.
export default (state = [], action) => {
    switch (action.type) {
        case FETCH_WORD_DATA:
            return action.payload.data;
        case SET_WORD_IMAGES:
            // Admin curation changed the images: keep everything else as is.
            return { ...state, images: action.payload };
        default:
            return state;
    }
}
