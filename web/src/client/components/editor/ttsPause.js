import { Node, mergeAttributes } from '@tiptap/core';
import { TTS_PAUSES, validPause } from '../../utils/tts';

// A read-aloud pause at one spot in a note (the ⏸ toolbar button): when
// the reading gets here, it waits that many seconds before going on.
//
// Stored as an empty <span class="tts-pause" data-seconds="3"></span>, so a
// note being read shows nothing. Only the editor draws it, as a small gray
// "⏸ 3s" chip (.rte-content .tts-pause in styles.css). It's one unit: the
// cursor steps over it, Backspace/Delete remove it whole, clicking selects
// it (and RichTextEditor then offers to change or remove it). Read-aloud
// turns it into silence of that length (htmlToChunks, ttsPlayer).
export const TtsPause = Node.create({
    name: 'ttsPause',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return {
            seconds: {
                default: TTS_PAUSES[0],
                parseHTML: (el) => validPause(el.getAttribute('data-seconds')) || TTS_PAUSES[0],
                renderHTML: (attrs) => ({ 'data-seconds': String(attrs.seconds) }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span.tts-pause' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'tts-pause' })];
    },

    // Nothing when the note is copied as plain text or searched.
    renderText() {
        return '';
    },

    addCommands() {
        return {
            insertTtsPause: (seconds) => ({ commands }) => commands.insertContent({
                type: this.name, attrs: { seconds: validPause(seconds) || TTS_PAUSES[0] },
            }),
            // The selected pause (after clicking its chip).
            setTtsPauseSeconds: (seconds) => ({ commands }) => commands.updateAttributes(this.name, {
                seconds: validPause(seconds) || TTS_PAUSES[0],
            }),
        };
    },
});

export default TtsPause;
