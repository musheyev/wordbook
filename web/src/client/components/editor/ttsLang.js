import { Mark, mergeAttributes } from '@tiptap/core';
import { TTS_LANGUAGES } from '../../utils/tts';

// "Read this as…" inline mark: tells read-aloud which language, and optionally
// which voice, to read the marked words in. E.g. a Spanish phrase in an
// English note, or one character's lines in a different voice.
//   - A language alone (Spanish, French…): for languages written in the same
//     letters as English, which read-aloud can't tell apart by itself.
//   - A language and a voice: any language, English and Hebrew included.
//
// Stored as <span class="tts-lang" lang="es-US" data-voice="es-US-…">…</span>.
// `lang` is also the standard HTML way to say what language text is in. The
// voice is saved in the note, so it's the same on every device and for anyone
// the note is shared with. Visible ONLY in the editor (a light tint per
// language, see .rte-content .tts-lang in styles.css); a note being read looks
// like plain text.
const CODES = TTS_LANGUAGES.map((l) => l.code);

export const TtsLang = Mark.create({
    name: 'ttsLang',

    addAttributes() {
        return {
            lang: {
                default: null,
                parseHTML: (el) => el.getAttribute('lang'),
                renderHTML: (attrs) => (attrs.lang ? { lang: attrs.lang } : {}),
            },
            voice: {
                default: null,
                parseHTML: (el) => el.getAttribute('data-voice'),
                renderHTML: (attrs) => (attrs.voice ? { 'data-voice': attrs.voice } : {}),
            },
        };
    },

    parseHTML() {
        // Only our own spans, and only a language we read, so `lang` on
        // pasted text (e.g. from Word) doesn't become a mark.
        return [{
            tag: 'span.tts-lang',
            getAttrs: (el) => (CODES.includes(el.getAttribute('lang')) ? {} : false),
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
        return {
            // A language read with that language's default voice; null
            // (Automatic) removes the mark.
            setTtsLang: (lang) => apply(lang ? { lang, voice: null } : null),
            // A language and a specific voice. Without a voice, English and
            // Hebrew need no mark (read automatically), so it's removed.
            setTtsVoice: (lang, voice) => apply(
                voice ? { lang, voice } : (lang && lang !== 'en-US' && lang !== 'he-IL' ? { lang, voice: null } : null)
            ),
        };
    },
});

export default TtsLang;
