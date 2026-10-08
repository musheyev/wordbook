// Turn a note's sanitized HTML (or plain text) into ordered chunks for
// text-to-speech: split into sentences, then into contiguous language runs so
// each part is read by the right voice. Math is skipped (reading KaTeX markup
// would be gibberish), and so is text marked "don't read aloud" (.tts-skip).
//
// Which language:
//   - text marked with a language (.tts-lang, the editor's language button)
//     is read in that language, e.g. a Spanish phrase in an English note;
//   - anything else: Hebrew letters are read in Hebrew, the rest in English.

const HEBREW = /[֐-׿]/;
const langOfChar = (ch) => (HEBREW.test(ch) ? 'he-IL' : 'en-US');

// Languages read-aloud speaks. The first two are recognised automatically;
// the rest are written in the same letters as English, so their text has to
// be marked in the editor (MARKABLE_LANGUAGES, in the toolbar's menu order).
export const TTS_LANGUAGES = [
    { code: 'en-US', label: 'English' },
    { code: 'he-IL', label: 'Hebrew' },
    { code: 'es-ES', label: 'Spanish' },
    { code: 'es-US', label: 'Spanish (LA)' },
    { code: 'fr-FR', label: 'French' },
    { code: 'it-IT', label: 'Italian' },
];
export const MARKABLE_LANGUAGES = TTS_LANGUAGES.slice(2);
const MARKABLE_CODES = MARKABLE_LANGUAGES.map((l) => l.code);

// Parse note HTML, minus everything that isn't read, with a newline after
// each block so sentences don't run together.
function readableDoc(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('.tts-skip, .katex, [data-type="block-math"], [data-type="inline-math"], script, style')
        .forEach((n) => n.remove());
    doc.querySelectorAll('p, div, li, h1, h2, h3, h4, br, tr').forEach((n) => {
        n.appendChild(doc.createTextNode('\n'));
    });
    return doc;
}

const tidy = (s) => s.replace(/[ \t]+/g, ' ');

export function htmlToPlainText(html) {
    if (!html) return '';
    return tidy(readableDoc(html).body.textContent || '').replace(/\n{2,}/g, '\n').trim();
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

const sentencesOf = (text) => String(text || '')
    .split(/(?<=[.!?׃…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

// Something to say: a chunk of only punctuation (a lone "—") is dropped.
const speakable = (t) => /[\p{L}\p{N}]/u.test(t);

// Chunks for text in no particular language: sentences, each split where it
// switches between Hebrew and English. `lang` forces one language instead.
function chunksOf(text, lang) {
    const chunks = [];
    for (const sentence of sentencesOf(text)) {
        if (lang) {
            if (speakable(sentence)) chunks.push({ text: sentence, lang });
            continue;
        }
        for (const run of splitByLanguage(sentence)) {
            const t = run.text.trim();
            if (speakable(t)) chunks.push({ text: t, lang: run.lang });
        }
    }
    return chunks;
}

export function textToChunks(text) {
    return chunksOf(text, null);
}

// The language a text node is marked with (its nearest .tts-lang), or null.
function markedLanguage(node) {
    const el = node.parentElement && node.parentElement.closest('.tts-lang[lang]');
    const lang = el && el.getAttribute('lang');
    return MARKABLE_CODES.includes(lang) ? lang : null;
}

// Note HTML -> chunks. The text is cut into stretches of the same marked
// language (bold, links etc. don't cut it), and each stretch is chunked on
// its own: marked stretches in their language, the rest automatically.
export function htmlToChunks(html) {
    if (!html) return [];
    const doc = readableDoc(html);
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const stretches = []; // { text, lang }
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const lang = markedLanguage(node);
        const last = stretches[stretches.length - 1];
        if (last && last.lang === lang) last.text += node.textContent;
        else stretches.push({ text: node.textContent, lang });
    }
    return stretches.flatMap((s) => chunksOf(tidy(s.text), s.lang));
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
