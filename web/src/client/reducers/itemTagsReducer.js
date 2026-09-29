import { SET_ITEM_TAGS } from '../actions';

// The current item's tags: { type, id, tags }. type/id let a view ignore tags
// that belong to a previously-selected item.
const initialState = { type: '', id: '', tags: [] };

export default (state = initialState, action) => {
    switch (action.type) {
        case SET_ITEM_TAGS:
            return { type: action.payload.type, id: action.payload.id, tags: action.payload.tags || [] };
        default:
            return state;
    }
};
