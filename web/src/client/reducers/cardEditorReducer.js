import { OPEN_CARD_EDITOR, CLOSE_CARD_EDITOR } from '../actions';

// Controls the global card create/edit modal.
//   open:     whether the modal is shown
//   mode:     'create' | 'edit'
//   card:     { card_id, title, content } when editing, else null
//   wordbook: wordbook to preselect when creating (the one being viewed)
const initialState = { open: false, mode: 'create', card: null, wordbook: '' };

export default (state = initialState, action) => {
    switch (action.type) {
        case OPEN_CARD_EDITOR:
            return {
                open: true,
                mode: action.payload.mode || 'create',
                card: action.payload.card || null,
                wordbook: action.payload.wordbook || '',
            };
        case CLOSE_CARD_EDITOR:
            return { ...initialState };
        default:
            return state;
    }
};
