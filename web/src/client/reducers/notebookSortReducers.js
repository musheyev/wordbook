import {
    FETCH_WORDBOOK_UPDATED, SET_NOTEBOOK_SORT, SET_ITEM_SORTS, SET_ITEM_COLORS,
    FETCH_WORDBOOK_KINDS, SET_WORDBOOK_KIND, WORDBOOK_KIND_RENAMED,
} from '../actions';

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

// Each notebook's kind: { [notebook name]: "wordbook" | "notebook" }, or
// null until loaded. Wordbooks are listed on My Wordbooks, the rest on My
// Notebooks; otherwise they're the same.
export function wordbookKindsReducer(state = null, action) {
    switch (action.type) {
        case FETCH_WORDBOOK_KINDS:
            return action.payload;
        case SET_WORDBOOK_KIND:
            return { ...(state || {}), [action.payload.name]: action.payload.kind };
        case WORDBOOK_KIND_RENAMED: {
            if (!state || !(action.payload.from in state)) return state;
            const { [action.payload.from]: kind, ...rest } = state;
            return { ...rest, [action.payload.to]: kind };
        }
        default:
            return state;
    }
}

// How each notebook's items are sorted: { [notebook name]: sort } (see
// utils/itemSort.js), or null until loaded.
export function itemSortsReducer(state = null, action) {
    switch (action.type) {
        case SET_ITEM_SORTS:
            return action.payload;
        default:
            return state;
    }
}

// Colours given to notes and words: { "<type>#<id>": colour } (see
// utils/itemColors.js), or null until loaded.
export function itemColorsReducer(state = null, action) {
    switch (action.type) {
        case SET_ITEM_COLORS:
            return action.payload;
        default:
            return state;
    }
}
