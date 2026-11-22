import {
    TOGGLE_NOTE_WINDOW_MODE, OPEN_NOTE_WINDOW, CLOSE_NOTE_WINDOW, FOCUS_NOTE_WINDOW,
} from '../actions';
import { readSavedWindows, saveWindows } from '../utils/noteWindowsSaved';

// State for the floating note windows:
//   mode     - whether clicking a note opens a window (persisted per viewer)
//   windows  - [{ id, cardId, title, notebook, z }] currently open; z is the
//              stacking order; notebook: where it was opened from ('' if unknown)
//   nextZ    - the next z-index to hand out (higher = on top / focused)
// Window geometry (x/y/w/h) is kept in each NoteWindow's local state, so dragging
// doesn't spam the store; only which windows exist and their focus order live here.
// The list is kept on this computer (utils/noteWindowsSaved.js), so the windows
// come back when the page is reloaded.

const MODE_KEY = 'note-window-mode';
const loadMode = () => {
    try { return localStorage.getItem(MODE_KEY) === '1'; } catch (e) { return false; }
};
const saveMode = (on) => {
    try { localStorage.setItem(MODE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
};

let idSeq = 0;

const saved = readSavedWindows();
const initialState = {
    mode: loadMode(),
    windows: saved.map((w, i) => ({ id: `nw${++idSeq}`, cardId: w.cardId, title: w.title, notebook: w.notebook || '', z: i + 1 })),
    nextZ: saved.length + 1,
};

// Every change to which windows are open is kept (utils/noteWindowsSaved.js).
const kept = (next) => { saveWindows(next.windows); return next; };

export default (state = initialState, action) => {
    switch (action.type) {
        case TOGGLE_NOTE_WINDOW_MODE: {
            const mode = !state.mode;
            saveMode(mode);
            return { ...state, mode };
        }
        case OPEN_NOTE_WINDOW: {
            const { cardId, title, notebook = '' } = action.payload;
            // Already open for this note: just bring it to the front.
            if (state.windows.some((w) => w.cardId === cardId)) {
                return kept({
                    ...state,
                    windows: state.windows.map((w) => (w.cardId === cardId ? { ...w, z: state.nextZ, notebook: notebook || w.notebook } : w)),
                    nextZ: state.nextZ + 1,
                });
            }
            const win = { id: `nw${++idSeq}`, cardId, title, notebook, z: state.nextZ };
            return kept({ ...state, windows: [...state.windows, win], nextZ: state.nextZ + 1 });
        }
        case CLOSE_NOTE_WINDOW:
            return kept({ ...state, windows: state.windows.filter((w) => w.id !== action.payload) });
        case FOCUS_NOTE_WINDOW:
            return kept({
                ...state,
                windows: state.windows.map((w) => (w.id === action.payload ? { ...w, z: state.nextZ } : w)),
                nextZ: state.nextZ + 1,
            });
        default:
            return state;
    }
};
