// Links from one note to another ("note links"), and the trail of links
// followed, so you can come back.
//
// A note link is an ordinary link in the note's HTML whose address names the
// note, not where it is:
//
//   <a href="/note/card/3f2c…">Spanish verbs</a>     a note (by its id)
//   <a href="/note/word/hablar">hablar</a>           a word (its definitions and your note)
//
// No notebook in the address: a note can be in several notebooks, and
// notebooks get renamed. Following a link finds a notebook that has it,
// preferring the one you're in (actions: findNoteLinkNotebook). The address
// is also a real page of the app (pages/NoteLinkPage.js), so a link opened in
// a new tab works too.
//
// The trail: each link followed remembers the page it was followed from
// ({ from, title, to }). While you're on the page a link took you to, the
// "‹ Back to …" pill (components/NoteLinks.js) offers the way back; going
// anywhere else (another item, another page) ends the trail. Several links
// in a row (A → B → C) go back one step at a time (C → B → A).
// The same small "publish / subscribe" idea as utils/quizLauncher.js.

const NOTE_LINK = /^\/note\/(card|word)\/([^/?#]+)$/;

/** The address of a link to a note or word. */
export const noteLinkHref = (type, id) => `/note/${type}/${encodeURIComponent(id)}`;

/**
 * The note a link points to, or null for any other link.
 * @param {string} href the link's address as written in the note
 * @returns {{type: 'card'|'word', id: string}|null}
 */
export function parseNoteLink(href) {
    const match = NOTE_LINK.exec(href || '');
    if (!match) return null;
    try {
        return { type: match[1], id: decodeURIComponent(match[2]) };
    } catch (e) {
        return null;
    }
}

// Addresses compared as the user would read them ("%20" and " " alike).
export const samePath = (a, b) => {
    const decode = (p) => { try { return decodeURIComponent(p); } catch (e) { return p; } };
    return decode(a || '') === decode(b || '');
};

let trail = [];
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn(trail));

/** The links followed so far, oldest first: [{ from, title, to }]. */
export const getTrail = () => trail;

/** Listen for changes to the trail. Returns a function that stops listening. */
export function onTrailChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/**
 * A link was followed.
 * @param {string} from  the page it was followed from (path and ?query)
 * @param {string} title what that page showed ("Lesson 3"), for "Back to …"
 * @param {string} to    the page it opened (path)
 */
export function pushTrail(from, title, to) {
    trail = [...trail, { from, title, to }];
    changed();
}

/**
 * The app moved to `pathname`: keep the trail if that's where the last link
 * went, step back one if it's where the last link came from (Back, or the
 * browser's back button), else end it.
 */
export function trailMovedTo(pathname) {
    let next = trail;
    while (next.length) {
        const last = next[next.length - 1];
        if (samePath(pathname, last.to)) break;
        if (samePath(pathname, last.from.split('?')[0])) { next = next.slice(0, -1); break; }
        next = [];
    }
    if (next !== trail) { trail = next; changed(); }
}

/** End the trail (the pill's ✕). */
export function clearTrail() {
    if (trail.length) { trail = []; changed(); }
}
