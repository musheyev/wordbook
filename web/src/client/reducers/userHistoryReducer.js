import { FETCH_USER_HISTORY } from '../actions';

export default (state = [], action) => {
    switch (action.type) {
        case FETCH_USER_HISTORY:
            return action.payload.data;
        default:
            return state;
    }
}