import { Node, mergeAttributes } from '@tiptap/core';

// A read-aloud bookmark: a spot in a note that the big player's bookmark
// buttons (⏮ 🔖 / 🔖 ⏭, PlayerPanel) jump to. Headings count as bookmarks
// too, without one (htmlToChunks in utils/tts.js).
//
// Stored as an empty <span class="tts-bookmark"></span>, so a note being
// read shows nothing; only the editor draws it, as a small "🔖" chip
// (.rte-content .tts-bookmark in styles.css). Added with the toolbar's 🔖
// button or Audio mode's "Bookmark"; one unit like a pause chip (the cursor
// steps over it, Backspace removes it whole).
export const TtsBookmark = Node.create({
    name: 'ttsBookmark',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    parseHTML() {
        return [{ tag: 'span.tts-bookmark' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'tts-bookmark' })];
    },

    // Nothing when the note is copied as plain text or searched.
    renderText() {
        return '';
    },

    addCommands() {
        return {
            insertTtsBookmark: () => ({ commands }) => commands.insertContent({ type: this.name }),
            insertTtsBookmarkAt: (pos) => ({ commands }) => commands.insertContentAt(pos, { type: this.name }),
        };
    },
});

export default TtsBookmark;
