import { Mark, mergeAttributes } from '@tiptap/core';

// "Don't read aloud" inline mark. Works exactly like bold/italic: toggle it on a
// selection (or toggle on, type, toggle off). It wraps text in
// <span class="tts-skip">…</span>, which:
//   - the TTS reader strips before speaking (see utils/tts.js htmlToPlainText)
//   - is styled ONLY inside the editor (dotted underline), so readers see it as
//     ordinary text (see the .rte-content .tts-skip rule in styles.css)
export const TtsSkip = Mark.create({
    name: 'ttsSkip',

    parseHTML() {
        return [{ tag: 'span.tts-skip' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'tts-skip' }), 0];
    },

    addCommands() {
        return {
            toggleTtsSkip: () => ({ commands }) => commands.toggleMark(this.name),
        };
    },

    addKeyboardShortcuts() {
        return {
            'Mod-Shift-m': () => this.editor.commands.toggleTtsSkip(),
        };
    },
});

export default TtsSkip;
