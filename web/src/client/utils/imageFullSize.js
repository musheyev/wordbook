// Click an image in a note to see it at full size (website only).
//
// Notes show images no wider than the note, so a screenshot from a big
// screen can look small on a laptop. Clicking it opens the image's own
// address in a new tab, where the browser shows it at its real size (and
// lets you zoom). Images are served by our API to signed-in users
// (api/routes/imagesRouter.js), and the new tab sends the same sign-in
// cookie, so it just works.
//
// One listener for the whole page ("event delegation"): a click anywhere
// bubbles up to `document`, and we check whether it landed on an image
// inside a note. That covers every place a note is read — the note page,
// note windows, the inbox, classrooms, a word's "Your note" — without
// touching each of them.
//
// Left alone: images inside a link (the link wins), images in the editor
// (clicking there selects the image), and the iPhone app (no tabs; pinch to
// zoom instead).
import { isNativeApp } from '../native/platform';

const NOTE_TEXT = '.card-content, .word-note__content, .note-window__body';

/**
 * Open a note image in a new tab when it's clicked. Called once, at start-up
 * (main.jsx).
 */
export function installImageFullSize() {
    if (typeof document === 'undefined' || isNativeApp()) return;
    document.addEventListener('click', (e) => {
        const img = e.target instanceof Element ? e.target.closest('img') : null;
        if (!img || !img.closest(NOTE_TEXT)) return;
        if (img.closest('a, .ProseMirror')) return;
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;
        // noopener: the new tab can't reach back into this page.
        window.open(src, '_blank', 'noopener');
    });
}
