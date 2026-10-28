import { SET_BOOKMARKS } from '../actions';

// My Bookmarks: null until loaded, then [{ type, id, title, at }], newest
// first (actions: fetchBookmarks, setBookmark, clearBookmarks).
export default function bookmarksReducer(state = null, action) {
    switch (action.type) {
        case SET_BOOKMARKS:
            return action.payload;
        default:
            return state;
    }
}
