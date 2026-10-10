import { sanitizeCardHtml } from './sanitize';

// Copy notes to the clipboard (admins, desktop overview: "Copy" for what's
// shown, "Copy selected" while ticking). Both forms go on the clipboard, so
// pasting into Google Docs or Word keeps headings, bold, lists and links,
// and pasting into a plain-text app gives clean text:
//
//   Spanish-1                      <h1>
//   Hola                           <h2> per note, then its text
//   Hi — Hola …
//   diabolical                     <h2> per word (just the word)

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// A note's HTML ready to copy: sanitized, read-aloud markers (pause and
// bookmark chips, which are empty) dropped, and formulas — stored as empty
// elements the app draws with KaTeX — as their LaTeX: $…$ / $$…$$.
function cleanDoc(html) {
    const doc = new DOMParser().parseFromString(sanitizeCardHtml(html), 'text/html');
    doc.querySelectorAll('.tts-pause, .tts-bookmark').forEach((n) => n.remove());
    doc.querySelectorAll('[data-type="inline-math"]').forEach((n) => n.replaceWith(`$${n.getAttribute('data-latex') || ''}$`));
    doc.querySelectorAll('[data-type="block-math"]').forEach((n) => {
        const p = doc.createElement('p');
        p.textContent = `$$${n.getAttribute('data-latex') || ''}$$`;
        n.replaceWith(p);
    });
    return doc;
}

// The same as plain text: a line per paragraph/heading/list item, "• "
// before list items.
function toPlain(doc) {
    doc.querySelectorAll('li').forEach((n) => n.insertBefore(doc.createTextNode('• '), n.firstChild));
    doc.querySelectorAll('p, div, h1, h2, h3, h4, br, tr, pre').forEach((n) => n.appendChild(doc.createTextNode('\n')));
    // A list item's own line, unless its text is already in a paragraph.
    doc.querySelectorAll('li').forEach((n) => { if (!n.querySelector('p, div')) n.appendChild(doc.createTextNode('\n')); });
    return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function build(title, items, loadContent) {
    const html = [`<h1>${esc(title)}</h1>`];
    const text = [title, ''];
    for (const item of items) {
        html.push(`<h2>${esc(item.title)}</h2>`);
        text.push(item.title);
        if (item.type === 'card') {
            const content = await loadContent(item.id);
            html.push(cleanDoc(content).body.innerHTML);
            const plain = toPlain(cleanDoc(content));
            if (plain) text.push(plain);
        }
        text.push('');
    }
    return { html: html.join('\n'), text: text.join('\n').trim() + '\n' };
}

/**
 * Put `items` (in this order) on the clipboard. Call it right in the click:
 * browsers only allow writing the clipboard there, so the write starts at
 * once and waits for the notes' text to load.
 *
 * @param {string} title the notebook's name (the top heading)
 * @param {Array<{type, id, title}>} items
 * @param {(cardId: string) => Promise<string>} loadContent a note's HTML
 * @returns {Promise<void>} rejects if it couldn't be copied
 */
export function copyNotes(title, items, loadContent) {
    const built = build(title, items, loadContent);
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        const blob = (type, key) => built.then((b) => new Blob([b[key]], { type }));
        return navigator.clipboard.write([new window.ClipboardItem({
            'text/html': blob('text/html', 'html'),
            'text/plain': blob('text/plain', 'text'),
        })]);
    }
    return built.then((b) => navigator.clipboard.writeText(b.text));
}
