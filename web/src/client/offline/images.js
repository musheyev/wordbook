import { apiFetch } from '../native/auth';
import { dbGet, dbPut } from './db';
import { isOnline, offlineEnabled, onConnectionChange } from './network';
import { isCovered } from './registry';

// Note images inside the iPhone app (step 5), and on the phone for offline.
//
// A note stores its images as addresses like "/api/images/<name>.jpg". On the
// website the browser fetches them itself and sends the login cookie. In the
// app it can't: the pages come from inside the app, so there's no cookie, and
// an <img> can't add the app's sign-in header. So in the app:
//
//   1. When a note's HTML is cleaned for display (utils/sanitize.js), each
//      such image's address moves to `data-api-src`, and `src` is left empty.
//   2. Once it's on screen (components/NoteHtml.js calls showApiImages), the
//      image is fetched with the sign-in (native/auth.js apiFetch), or read
//      from the phone, and shown from a "blob URL": an address the browser
//      makes up for data it already holds in memory.
//
// Images of downloaded notes are saved in IndexedDB (offline/db.js "images"),
// with `items` — the notes they belong to — so removing a download finds them.

const IMAGE_PATH = /^\/api\/images\/[A-Za-z0-9-]+\.(png|jpg|gif|webp)$/;

/** Does this note image need loading by us (rather than by the browser)? */
export const loadsImagesItself = () => offlineEnabled();

/** Is `src` one of our note images ("/api/images/…")? */
export const isApiImage = (src) => IMAGE_PATH.test(src || '');

// Blob URLs made this visit, so an image shown twice is fetched once (and
// one that couldn't be had isn't asked for on every redraw). Forgotten when
// the connection comes or goes, so it's tried again.
const shown = new Map(); // path -> Promise<string|null>
onConnectionChange(() => shown.clear());

async function fetchImage(path) {
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(`Image ${res.status}`);
    return res.blob();
}

/** Save an image's bytes on the phone as belonging to `owner`. */
async function save(path, blob, owner) {
    const existing = await dbGet('images', path).catch(() => null);
    const items = new Set((existing && existing.items) || []);
    items.add(owner);
    await dbPut('images', path, { blob: blob || existing.blob, items: [...items], savedAt: Date.now() });
}

/**
 * A blob URL to show a note image, or null if it can't be had (offline and
 * not downloaded, or gone from the server).
 *
 * @param {string} path "/api/images/<name>"
 * @param {string} [owner] the note it's shown in ("card:<id>"); if that note
 *   is downloaded, a freshly fetched image is saved for offline
 */
export function apiImageUrl(path, owner) {
    if (!shown.has(path)) {
        shown.set(path, (async () => {
            const saved = await dbGet('images', path).catch(() => null);
            if (saved && saved.blob) return URL.createObjectURL(saved.blob);
            if (!isOnline()) return null;
            const blob = await fetchImage(path);
            if (owner && isCovered(owner)) save(path, blob, owner).catch(() => {});
            return URL.createObjectURL(blob);
        })().catch(() => null));
    }
    return shown.get(path);
}

/**
 * Fill in the images inside an element showing note HTML (step 2 above).
 * An image that can't be loaded gets a small "Image not available offline"
 * caption instead of a broken picture.
 *
 * @param {HTMLElement} root
 * @param {string} [owner] the note shown, e.g. "card:<id>"
 */
export function showApiImages(root, owner) {
    if (!root) return;
    // Images already shown (this runs after every redraw) are left alone.
    root.querySelectorAll('img[data-api-src]:not([src])').forEach(async (img) => {
        const url = await apiImageUrl(img.getAttribute('data-api-src'), owner);
        if (url) {
            img.src = url;
            img.classList.remove('img-unavailable');
        } else {
            img.classList.add('img-unavailable');
            img.alt = isOnline() ? 'Image not found' : 'Image not available offline';
        }
    });
}

/**
 * Download a note's images (offline/downloads.js).
 *
 * @param {string} html the note's content
 * @param {string} owner "card:<id>"
 */
export async function saveNoteImages(html, owner) {
    const paths = [...(html || '').matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter(isApiImage);
    for (const path of new Set(paths)) {
        const existing = await dbGet('images', path).catch(() => null);
        if (existing && existing.blob) {
            if (!(existing.items || []).includes(owner)) await save(path, null, owner);
        } else {
            await save(path, await fetchImage(path), owner);
        }
    }
}
