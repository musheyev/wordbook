// The voices Google offers per language, for the voice pickers (ReadAloud's
// per-language choice and the editor's voice for selected text). Fetched once
// per language: [{ name, label, gender }], most natural first.
import { voiceLabel } from './tts';

const cache = {};

// Chirp 3 HD first, then Chirp, Neural2, WaveNet, the rest.
const rank = (n) => (n.includes('Chirp3-HD') ? 0 : n.includes('Chirp') ? 1 : n.includes('Neural2') ? 2 : n.includes('Wavenet') ? 3 : 4);

const genderOf = (g) => (g === 'FEMALE' ? 'female' : g === 'MALE' ? 'male' : '');

export async function loadVoices(lang) {
    if (cache[lang]) return cache[lang];
    try {
        const res = await fetch(`/api/tts/voices?lang=${encodeURIComponent(lang)}`, { credentials: 'same-origin' });
        const data = await res.json();
        cache[lang] = (data.voices || [])
            .map((v) => ({ name: v.name, label: voiceLabel(v.name), gender: genderOf(v.ssmlGender) }))
            .sort((a, b) => rank(a.name) - rank(b.name) || a.label.localeCompare(b.label));
    } catch (e) {
        return []; // not cached: try again next time
    }
    return cache[lang];
}

// A short sample to preview a voice when no text is selected.
export const SAMPLE_TEXT = {
    'en-US': 'Hello, this is how I sound.',
    'he-IL': 'שלום, ככה אני נשמע.',
    'es-ES': 'Hola, así es como sueno.',
    'es-US': 'Hola, así es como sueno.',
    'fr-FR': 'Bonjour, voici ma voix.',
    'it-IT': 'Ciao, questa è la mia voce.',
    'de-DE': 'Hallo, so klinge ich.',
};
