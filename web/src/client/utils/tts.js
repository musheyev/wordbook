// Turn a note's sanitized HTML (or plain text) into ordered chunks for
// text-to-speech: split into sentences, then into contiguous language runs so
// Hebrew and English in one note are each read by the right voice. Math is
// skipped (reading KaTeX markup would be gibberish).

const HEBREW = /[֐-׿]/;
const langOfChar = (ch) => (HEBREW.test(ch) ? 'he-IL' : 'en-US');

export function htmlToPlainText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('.tts-skip, .katex, [data-type="block-math"], [data-type="inline-math"], script, style')
        .forEach((n) => n.remove());
    // Give block elements a newline so sentences don't run together.
    doc.querySelectorAll('p, div, li, h1, h2, h3, h4, br, tr').forEach((n) => {
        n.appendChild(doc.createTextNode('\n'));
    });
    return (doc.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

// Contiguous runs of the same language (letters decide; spaces/punctuation stick
// to the current run).
function splitByLanguage(s) {
    const runs = [];
    let cur = '';
    let curLang = null;
    for (const ch of s) {
        if (/\p{L}/u.test(ch)) {
            const lang = langOfChar(ch);
            if (curLang && lang !== curLang) { runs.push({ text: cur, lang: curLang }); cur = ''; }
            curLang = lang;
        }
        cur += ch;
    }
    if (cur.trim()) runs.push({ text: cur, lang: curLang || 'en-US' });
    return runs;
}

export function textToChunks(text) {
    const sentences = String(text || '')
        .split(/(?<=[.!?׃…])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const chunks = [];
    for (const sentence of sentences) {
        for (const run of splitByLanguage(sentence)) {
            const t = run.text.trim();
            if (t) chunks.push({ text: t, lang: run.lang });
        }
    }
    return chunks;
}

export function htmlToChunks(html) {
    return textToChunks(htmlToPlainText(html));
}

// Chosen voices per language, persisted per viewer. { 'en-US': name, 'he-IL': name }
const VOICE_KEY = 'tts-voices';
export function getChosenVoices() {
    try { return JSON.parse(localStorage.getItem(VOICE_KEY)) || {}; } catch (e) { return {}; }
}
export function setChosenVoice(lang, name) {
    const v = getChosenVoices();
    if (name) v[lang] = name; else delete v[lang];
    try { localStorage.setItem(VOICE_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
}
