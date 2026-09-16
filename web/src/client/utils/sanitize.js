// Card bodies are user-authored HTML that we render with dangerouslySetInnerHTML,
// so they must be sanitized to avoid stored XSS. We also force every link to
// open safely in a new tab.
import DOMPurify from 'dompurify';

// Make all links open in a new tab with a safe rel. Registered once at module load.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

export function sanitizeCardHtml(html) {
    return DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } });
}
