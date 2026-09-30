import {
    TOGGLE_NOTE_WINDOW_MODE, OPEN_NOTE_WINDOW, CLOSE_NOTE_WINDOW, FOCUS_NOTE_WINDOW,
} from '../actions';

// State for the floating note windows:
//   mode     - whether clicking a note opens a window (persisted per viewer)
//   windows  - [{ id, cardId, title, z }] currently open; z is the stacking order
//   nextZ    - the next z-index to hand out (higher = on top / focused)
// Window geometry (x/y/w/h) is kept in each NoteWindow's local state, so dragging
// doesn't spam the store; only which windows exist and their focus order live here.

const MODE_KEY = 'note-window-mode';
const loadMode = () => {
    try { return localStorage.getItem(MODE_KEY) === '1'; } catch (e) { return false; }
};
const saveMode = (on) => {
    try { localStorage.setItem(MODE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
};

let idSeq = 0;

const initialState = { mode: loadMode(), windows: [], nextZ: 1 };

export default (state = initialState, action) => {
    switch (action.type) {
        case TOGGLE_NOTE_WINDOW_MODE: {
            const mode = !state.mode;
            saveMode(mode);
            return { ...state, mode };
        }
        case OPEN_NOTE_WINDOW: {
            const { cardId, title } = action.payload;
            // Already open for this note: just bring it to the front.
            if (state.windows.some((w) => w.cardId === cardId)) {
                return {
                    ...state,
                    windows: state.windows.map((w) => (w.cardId === cardId ? { ...w, z: state.nextZ } : w)),
                    nextZ: state.nextZ + 1,
                };
            }
            const win = { id: `nw${++idSeq}`, cardId, title, z: state.nextZ };
            return { ...state, windows: [...state.windows, win], nextZ: state.nextZ + 1 };
        }
        case CLOSE_NOTE_WINDOW:
            return { ...state, windows: state.windows.filter((w) => w.id !== action.payload) };
        case FOCUS_NOTE_WINDOW:
            return {
                ...state,
                windows: state.windows.map((w) => (w.id === action.payload ? { ...w, z: state.nextZ } : w)),
                nextZ: state.nextZ + 1,
            };
        default:
            return state;
    }
};
