import { FETCH_WORD_WORDBOOKS} from '../actions';

export default (state = [], action) => {
    switch (action.type) {
        case FETCH_WORD_WORDBOOKS:
                return action.payload.data;
        default:
            return state;
    }
}