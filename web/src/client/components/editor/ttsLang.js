import { Mark, mergeAttributes } from '@tiptap/core';
import { MARKABLE_LANGUAGES } from '../../utils/tts';

// "Read in <language>" inline mark: tells read-aloud to use that language's
// voice for the marked words, e.g. a Spanish phrase in an English note.
// English and Hebrew need no mark (they're told apart by alphabet); this is
// for languages written in the same letters as English.
//
// Stored as <span class="tts-lang" lang="es-ES">…</span>. `lang` is also the
// standard HTML way to say what language text is in. It's visible ONLY in
// the editor (a light tint per language, see .rte-content .tts-lang in
// styles.css); a note being read looks exactly like plain text.
const CODES = MARKABLE_LANGUAGES.map((l) => l.code);

export const TtsLang = Mark.create({
    name: 'ttsLang',

    addAttributes() {
        return {
            lang: {
                default: null,
                parseHTML: (el) => el.getAttribute('lang'),
                renderHTML: (attrs) => (attrs.lang ? { lang: attrs.lang } : {}),
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
        return {
            // Mark the selection as `lang`; null (Automatic) removes the mark.
            // With just a cursor inside marked text, the whole marked phrase
            // changes (like changing a link), not only the next letters typed.
            setTtsLang: (lang) => ({ editor, chain }) => {
                let next = chain();
                if (editor.state.selection.empty && editor.isActive(this.name)) {
                    next = next.extendMarkRange(this.name);
                }
                next = next.unsetMark(this.name);
                if (lang) next = next.setMark(this.name, { lang });
                return next.run();
            },
        };
    },
});

export default TtsLang;
