import { FETCH_WORDBOOK_UPDATED, SET_NOTEBOOK_SORT } from '../actions';

// How My Notebooks is sorted: "az" | "updated" | "custom", or null until the
// saved choice has loaded.
export function notebookSortReducer(state = null, action) {
    switch (action.type) {
        case SET_NOTEBOOK_SORT:
            return action.payload;
        default:
            return state;
    }
}

// { [notebook name]: ISO time it was last updated, or null }.
export function wordbookUpdatedReducer(state = {}, action) {
    switch (action.type) {
        case FETCH_WORDBOOK_UPDATED:
            return action.payload;
        default:
            return state;
    }
}
