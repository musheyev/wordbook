import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Audio mode (the editor's 🎧 button, see RichTextEditor): marking how a
// note is read aloud without the phone's keyboard or its Copy/Paste menu.
// The note can't be typed in while it's on, so tapping selects text the
// app's own way instead of the phone's:
//   sentenceAt  the whole sentence around a tap (read-aloud reads sentence
//               by sentence, see sentencesOf in utils/tts.js)
//   wordAt      the word around a tap (for a phrase inside a sentence)
// The selection is the editor's own (so the read-aloud commands act on it);
// this extension draws it, since the phone doesn't while nothing can be
// typed: .rte-audio-sel in styles.css.
export const audioSelectKey = new PluginKey('audioSelect');

// A textblock's text with doc positions: at[i] = position of character i.
// A pause chip or other inline node counts as one character that's neither
// a letter nor a sentence end; a line break ends a sentence.
function blockAt(doc, pos) {
    const $pos = doc.resolve(pos);
    const block = $pos.parent;
    if (!block.isTextblock) return null;
    const start = $pos.start();
    let text = '';
    const at = [];
    block.forEach((child, offset) => {
        const p = start + offset;
        if (child.isText) {
            for (let i = 0; i < child.text.length; i++) at.push(p + i);
            text += child.text;
        } else {
            at.push(p);
            text += child.type.name === 'hardBreak' ? '\n' : '￼';
        }
    });
    const end = start + block.content.size;
    // Index in `text` of a document position in this block.
    const indexOf = (q) => {
        const i = at.findIndex((p) => p >= q);
        return i === -1 ? text.length : i;
    };
    const posOf = (i) => (i < at.length ? at[i] : end);
    return { text, indexOf, posOf };
}

// Trimmed [from, to) of text[a..b), as doc positions, or null if blank.
function trimmed(b, a, z) {
    while (a < z && /[\s￼]/.test(b.text[a])) a += 1;
    while (z > a && /[\s￼]/.test(b.text[z - 1])) z -= 1;
    return a < z ? { from: b.posOf(a), to: b.posOf(z) } : null;
}

// Sentence ends: . ! ? ׃ … (with closing quotes/brackets) before a space,
// or a line break — as read-aloud splits them.
const SENTENCE_END = /[.!?׃…]+["'”’)\]]*(?=\s)|\n/g;

/** The sentence around doc position `pos`: { from, to }, or null. */
export function sentenceAt(doc, pos) {
    const b = blockAt(doc, pos);
    if (!b) return null;
    const i = b.indexOf(pos);
    let a = 0;
    let z = b.text.length;
    SENTENCE_END.lastIndex = 0;
    for (let m = SENTENCE_END.exec(b.text); m; m = SENTENCE_END.exec(b.text)) {
        const stop = m.index + m[0].length;
        if (stop <= i) a = stop;
        else { z = stop; break; }
    }
    return trimmed(b, a, z);
}

const WORD = /[\p{L}\p{N}\p{M}'’-]/u;
const TRAILING = /[.!?׃…,;:"'”’)\]]/;

/**
 * The word around doc position `pos` ({ from, to }, or null on a space or
 * punctuation with no word just before it). `withPunctuation`: include the
 * punctuation right after it ("útil." rather than "útil"), for the last
 * word of a phrase.
 */
export function wordAt(doc, pos, withPunctuation = false) {
    const b = blockAt(doc, pos);
    if (!b) return null;
    let i = b.indexOf(pos);
    if (!WORD.test(b.text[i] || '') && WORD.test(b.text[i - 1] || '')) i -= 1;
    if (!WORD.test(b.text[i] || '')) return null;
    let a = i;
    let z = i + 1;
    while (a > 0 && WORD.test(b.text[a - 1])) a -= 1;
    while (z < b.text.length && WORD.test(b.text[z])) z += 1;
    if (withPunctuation) while (z < b.text.length && TRAILING.test(b.text[z])) z += 1;
    return { from: b.posOf(a), to: b.posOf(z) };
}

export const AudioSelect = Extension.create({
    name: 'audioSelect',

    // on: Audio mode is on (set by RichTextEditor).
    addStorage() {
        return { on: false };
    },

    addProseMirrorPlugins() {
        const { editor } = this;
        return [new Plugin({
            key: audioSelectKey,
            props: {
                decorations(state) {
                    const { selection } = state;
                    const store = editor.storage.audioSelect;
                    if (!store || !store.on || selection.empty) return null;
                    const deco = selection.node
                        ? Decoration.node(selection.from, selection.to, { class: 'rte-audio-sel-node' })
                        : Decoration.inline(selection.from, selection.to, { class: 'rte-audio-sel' });
                    return DecorationSet.create(state.doc, [deco]);
                },
            },
        })];
    },
});

export default AudioSelect;
