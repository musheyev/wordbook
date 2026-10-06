import { SET_MY_WORD_IMAGES, SET_IMAGE_SEARCH_ENABLED } from '../actions';

// The signed-in user's own images for the word on screen: { word, images }.
export function myWordImagesReducer(state = { word: null, images: [] }, action) {
    switch (action.type) {
        case SET_MY_WORD_IMAGES:
            return action.payload;
        default:
            return state;
    }
}

// Admins: whether Brave image search is on for the whole app. null until
// loaded (and for everyone else).
export function imageSearchEnabledReducer(state = null, action) {
    switch (action.type) {
        case SET_IMAGE_SEARCH_ENABLED:
            return action.payload;
        default:
            return state;
    }
}
