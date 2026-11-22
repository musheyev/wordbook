// The floating note windows (NoteWindows.js), kept on this computer so they
// come back after the page is reloaded: which notes were open (in front-to-back
// order), the notebook each was opened from, and each one's place and size.
//
// localStorage "note-windows":
//   [{ cardId, title, notebook }]              in stacking order, last on top
// localStorage "note-window-geom":
//   { "<cardId>": { x, y, w, h, maximized } }  where it was, by note
// A window that was being edited comes back for reading (its unsaved text is
// still kept by the editor's draft, which offers Restore).

const LIST_KEY = 'note-windows';
const GEOM_KEY = 'note-window-geom';

const read = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
};
const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not kept */ }
};

/** The windows open last time: [{ cardId, title, notebook }], bottom to top. */
export function readSavedWindows() {
    const list = read(LIST_KEY, []);
    return Array.isArray(list) ? list.filter((w) => w && typeof w.cardId === 'string') : [];
}

/** Keep the open windows (the store's list), bottom to top. */
export function saveWindows(windows) {
    const ordered = [...windows].sort((a, b) => a.z - b.z)
        .map(({ cardId, title, notebook }) => ({ cardId, title, notebook: notebook || '' }));
    write(LIST_KEY, ordered);
    // Forget the places of notes no longer open.
    const geom = read(GEOM_KEY, {});
    const open = new Set(ordered.map((w) => w.cardId));
    Object.keys(geom).forEach((id) => { if (!open.has(id)) delete geom[id]; });
    write(GEOM_KEY, geom);
}

/** Where a note's window was ({ x, y, w, h, maximized }), or null. */
export function readSavedGeom(cardId) {
    const g = read(GEOM_KEY, {})[cardId];
    return g && Number.isFinite(g.x) && Number.isFinite(g.w) ? g : null;
}

/** Keep where a note's window is. */
export function saveGeom(cardId, geom, maximized) {
    const all = read(GEOM_KEY, {});
    all[cardId] = { ...geom, maximized: !!maximized };
    write(GEOM_KEY, all);
}
