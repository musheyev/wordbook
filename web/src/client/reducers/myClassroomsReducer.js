import { SET_MY_CLASSROOMS } from '../actions';

// My Classrooms ({ teaching, joined, invited }; api/classrooms.js), or null
// until loaded. The side panel's tree and the More page read it.
export default function myClassroomsReducer(state = null, action) {
    switch (action.type) {
        case SET_MY_CLASSROOMS:
            return action.payload;
        default:
            return state;
    }
}
