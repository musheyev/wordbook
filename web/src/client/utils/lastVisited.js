// The note (or word) last opened in each notebook, for this session only:
// when you come back to the notebook, its card / row is highlighted and
// scrolled into view (NotebookOverview, NotebookItemList). Kept in
// sessionStorage — it lasts through a reload of this tab and is gone when
// the tab or app is closed; nothing is saved on the server.
const KEY = 'last-visited';

const read = () => {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
};

/** "<type>:<id>" of the item last opened in `notebook`, or null. */
export const getLastVisited = (notebook) => read()[notebook] || null;

export function setLastVisited(notebook, type, id) {
    if (!notebook || !type || !id) return;
    const all = read();
    all[notebook] = `${type}:${id}`;
    try { sessionStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* this visit only */ }
}

// Whether an element is fully on screen, clear of the phone's tab bar at the
// bottom and of the edges of the scrolling area it's in.
export function inPlainView(el) {
    const r = el.getBoundingClientRect();
    // The phone's tab bar (the nav rail, docked at the bottom on phones).
    const bar = document.querySelector('.nav-rail');
    const barRect = bar && bar.getBoundingClientRect();
    const barTop = barRect && barRect.top > window.innerHeight / 2 ? barRect.top : window.innerHeight;
    let top = 0;
    let bottom = Math.min(window.innerHeight, barTop);
    const box = el.closest('.nb-overview');
    if (box) { const b = box.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
    return r.top >= top && r.bottom <= bottom;
}
