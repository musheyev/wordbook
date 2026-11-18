import { SET_ALL_TAGS, SET_ITEM_TAGS } from '../actions';

// Every tagged item for the user: [{ type, id, title, tags }], or null until
// loaded (fetchAllTags). Used by the Tags page, the tag view and the list
// that opens from a tag on a note.
//
// When one item's tags are saved (setItemTags; `saved` tells a save from
// the clearing a load starts with), the list follows at once, so a tag view
// or tag list open on screen doesn't wait for the next load: the item gets
// its new tags, leaves the list when it has none, and joins it when it's
// newly tagged.
export default (state = null, action) => {
    switch (action.type) {
        case SET_ALL_TAGS:
            return action.payload;
        case SET_ITEM_TAGS: {
            if (!action.saved || !Array.isArray(state)) return state;
            const { type, id, tags, title } = action.payload;
            const others = state.filter((it) => !(it.type === type && it.id === id));
            if (!tags || tags.length === 0) return others;
            const was = state.find((it) => it.type === type && it.id === id);
            return [...others, { type, id, title: (was && was.title) || title || id, tags }];
        }
        default:
            return state;
    }
};
