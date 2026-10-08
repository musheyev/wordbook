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
    { code: 'de-DE', label: 'German' },
];
export const MARKABLE_LANGUAGES = TTS_LANGUAGES.slice(2);
const ALL_CODES = TTS_LANGUAGES.map((l) => l.code);
export const languageLabel = (code) => (TTS_LANGUAGES.find((l) => l.code === code) || {}).label || code;

// A voice's name for people: "es-US-Chirp3-HD-Achernar" -> "Achernar",
// "es-US-Neural2-A" -> "Neural2-A".
export const voiceLabel = (name) => String(name || '')
    .replace(/^[a-z]{2,3}-[A-Z]{2}-/, '')
    .replace(/^Chirp3-HD-/, '');

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

// How a text node is marked to be read (its nearest .tts-lang): { lang,
// voice?, speed? }, or null. A mark can set a language (Spanish…), a
// specific voice (needs a language), and a speed. Without a language
// (lang null) the text is read automatically, English or Hebrew by its
// letters, just at the marked speed.
function markedReading(node) {
    const el = node.parentElement && node.parentElement.closest('.tts-lang');
    if (!el) return null;
    const lang = ALL_CODES.includes(el.getAttribute('lang')) ? el.getAttribute('lang') : null;
    const speed = Number(el.getAttribute('data-speed'));
    const validSpeed = TTS_SPEEDS.includes(speed) ? speed : undefined;
    if (!lang && !validSpeed) return null;
    return { lang, voice: lang ? el.getAttribute('data-voice') || undefined : undefined, speed: validSpeed };
}
const sameReading = (a, b) => (a && b
    ? a.lang === b.lang && a.voice === b.voice && a.speed === b.speed
    : a === b);

// Note HTML -> chunks. The text is cut into stretches marked the same way
// (bold, links etc. don't cut it), and each stretch is chunked on its own:
// marked stretches in their language (and voice, if one was chosen), the
// rest automatically.
export function htmlToChunks(html) {
    if (!html) return [];
    const doc = readableDoc(html);
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const stretches = []; // { text, reading }
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const reading = markedReading(node);
        const last = stretches[stretches.length - 1];
        if (last && sameReading(last.reading, reading)) last.text += node.textContent;
        else stretches.push({ text: node.textContent, reading });
    }
    return stretches.flatMap((s) => {
        const r = s.reading;
        const chunks = chunksOf(tidy(s.text), r ? r.lang : null);
        if (!r || (!r.voice && !r.speed)) return chunks;
        return chunks.map((c) => ({
            ...c,
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.speed ? { speed: r.speed } : {}),
        }));
    });
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

// Reading speed per language, persisted per viewer: { 'es-US': 0.75, ... }.
// A language with no entry plays at normal speed (1). Applied by slowing the
// audio in the browser (pitch kept natural), so it works with every voice and
// with audio already generated, at no extra cost.
export const TTS_SPEEDS = [0.6, 0.75, 0.9, 1, 1.25];
const SPEED_KEY = 'tts-speeds';
export function getChosenSpeeds() {
    try { return JSON.parse(localStorage.getItem(SPEED_KEY)) || {}; } catch (e) { return {}; }
}
export function setChosenSpeed(lang, speed) {
    const v = getChosenSpeeds();
    if (speed && speed !== 1) v[lang] = speed; else delete v[lang];
    try { localStorage.setItem(SPEED_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

// Which item a chunk belongs to, so the server can track the audio each item
// uses and an admin can clean up audio no item uses any more (api/tts-refs.js).
//   card:<card_id>   a note              wordnote:<word>   your note on a word
//   worddefs:<word>  a word's page       wordtitle:<word>  just the word
export const tagItem = (chunks, item) => chunks.map((c) => ({ ...c, item }));

// A note read aloud: the same chunks wherever it's read (its page, a note
// window, a notebook's "Play all"), so its audio list doesn't flip-flop.
export const cardChunks = (card) => tagItem(htmlToChunks(card.content), `card:${card.card_id}`);
