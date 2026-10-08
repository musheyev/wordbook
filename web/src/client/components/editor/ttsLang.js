import { Mark, mergeAttributes } from '@tiptap/core';
import { TTS_LANGUAGES, TTS_SPEEDS } from '../../utils/tts';

// "Read this as…" inline mark: tells read-aloud how to read the marked words
// — in which language, optionally with which voice, and at what speed. E.g. a
// Spanish phrase in an English note, one character's lines in a different
// voice, or a hard sentence slowed down.
//   - A language alone (Spanish, French…): for languages written in the same
//     letters as English, which read-aloud can't tell apart by itself.
//   - A voice: needs a language; any language, English and Hebrew included.
//   - A speed: on its own (read automatically, English or Hebrew by its
//     letters) or with a language/voice. Wins over the language's speed.
//
// Stored as <span class="tts-lang" lang="es-US" data-voice="…" data-speed="0.75">.
// `lang` is also the standard HTML way to say what language text is in. It's
// all saved in the note, so it reads the same on every device and for anyone
// the note is shared with. Visible ONLY in the editor (a light tint, see
// .rte-content .tts-lang in styles.css); a note being read looks plain.
const CODES = TTS_LANGUAGES.map((l) => l.code);
const validSpeed = (s) => (TTS_SPEEDS.includes(Number(s)) ? Number(s) : null);

export const TtsLang = Mark.create({
    name: 'ttsLang',

    addAttributes() {
        return {
            lang: {
                default: null,
                parseHTML: (el) => (CODES.includes(el.getAttribute('lang')) ? el.getAttribute('lang') : null),
                renderHTML: (attrs) => (attrs.lang ? { lang: attrs.lang } : {}),
            },
            voice: {
                default: null,
                parseHTML: (el) => el.getAttribute('data-voice'),
                renderHTML: (attrs) => (attrs.voice ? { 'data-voice': attrs.voice } : {}),
            },
            speed: {
                default: null,
                parseHTML: (el) => validSpeed(el.getAttribute('data-speed')),
                renderHTML: (attrs) => (attrs.speed ? { 'data-speed': String(attrs.speed) } : {}),
            },
        };
    },

    parseHTML() {
        // Only our own spans, with a language we read or a speed, so `lang`
        // on pasted text (e.g. from Word) doesn't become a mark.
        return [{
            tag: 'span.tts-lang',
            getAttrs: (el) => (CODES.includes(el.getAttribute('lang')) || validSpeed(el.getAttribute('data-speed'))
                ? {} : false),
        }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'tts-lang' }), 0];
    },

    addCommands() {
        // Replace the mark on the selection. With just a cursor inside marked
        // text, the whole marked phrase changes (like changing a link), not
        // only the next letters typed. No attrs removes the mark.
        const apply = (attrs) => ({ editor, chain }) => {
            let next = chain();
            if (editor.state.selection.empty && editor.isActive(this.name)) {
                next = next.extendMarkRange(this.name);
            }
            next = next.unsetMark(this.name);
            if (attrs) next = next.setMark(this.name, attrs);
            return next.run();
        };
        // What to store, or null when there's nothing to say (English or
        // Hebrew, or no language, with no voice and no speed: that's just
        // how text is read anyway).
        const reading = ({ lang, voice, speed }) => {
            const l = CODES.includes(lang) ? lang : null;
            const v = l && voice ? voice : null;
            const s = validSpeed(speed);
            const automatic = !l || l === 'en-US' || l === 'he-IL';
            if (automatic && !v && !s) return null;
            return { lang: automatic && !v ? null : l, voice: v, speed: s };
        };
        return {
            // From the menu: a language with its default voice, keeping any
            // speed; null (Automatic) removes the mark.
            setTtsLang: (lang) => ({ editor, ...rest }) => apply(lang
                ? reading({ lang, voice: null, speed: editor.getAttributes(this.name).speed })
                : null)({ editor, ...rest }),
            // From "Voice and speed…": language (null = automatic), voice
            // (null = the language's default) and speed (null = the
            // language's speed).
            setTtsReading: (opts) => apply(reading(opts || {})),
        };
    },
});

export default TtsLang;
