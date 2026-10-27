// Card bodies are user-authored HTML that we render with dangerouslySetInnerHTML,
// so they must be sanitized to avoid stored XSS. We also force every link to
// open safely in a new tab.
import DOMPurify from 'dompurify';
import { siteUrl } from '../native/platform';
import { isApiImage, loadsImagesItself } from '../offline/images';

// Make all links open in a new tab with a safe rel. Registered once at module load.
// Except links to another note ("/note/…", utils/noteLinks.js): those open
// in the app (components/NoteLinks.js), so they stay in this tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^\/note\//.test(node.getAttribute('href') || '')) {
        node.removeAttribute('target');
    } else if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
    // Images saved as "/api/images/…". Inside the iPhone app they can't load
    // by themselves (no login cookie there): the address moves to
    // data-api-src and components/NoteHtml.js loads them with the app's
    // sign-in, or from the phone offline (offline/images.js). Other images:
    // in full inside the app (client/native/platform.js).
    if (node.tagName === 'IMG' && node.getAttribute('src')) {
        const src = node.getAttribute('src');
        if (loadsImagesItself() && isApiImage(src)) {
            node.setAttribute('data-api-src', src);
            node.removeAttribute('src');
        } else {
            node.setAttribute('src', siteUrl(src));
        }
    }
});

export function sanitizeCardHtml(html) {
    // data-api-src is ours (above); DOMPurify keeps data- attributes anyway.
    return DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } });
}
