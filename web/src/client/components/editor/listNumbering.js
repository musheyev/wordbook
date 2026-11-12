import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';

// Numbered lists keep counting when an item is taken out of the middle.
//
// Say a list runs 1–10 and you press Backspace at the start of item 8 (or
// Shift-Tab, or Enter on an empty item 8, or click "1. List" on it): item 8
// becomes plain text, which splits the list in two. ProseMirror gives the
// bottom part the same `start` as the top one, so it restarted at 1. With
// this, it continues instead: the old 9 becomes 8. To make it start at 1
// again, select its first item and click "1. List" (editor/listSplit.js).
//
// How it works. A ProseMirror "plugin" can look at every change after it
// happens and add a correction of its own (appendTransaction); the
// correction joins the same undo step. After any change to the text, each
// numbered list is checked against the numbered list before it at the same
// level (text, headings etc. may sit between them). It should CONTINUE
// that list, i.e. start at its start plus its number of items, when:
//
//   - it's a piece of a list that was just split (an item taken out of the
//     middle), and it still has that list's old `start`; or
//   - it already continued the list before it before this change, and this
//     change didn't give it a new `start`. So removing or adding an item
//     higher up renumbers the lists below, all the way down.
//
// To find "the same list before this change", each list's position is
// traced back to the old document: every change records a mapping of old
// positions to new ones, and inverted it maps new positions back.
//
// A list whose `start` this change set on purpose (restart at 1), and lists
// that never continued another, are left alone.
const ORDERED = 'orderedList';
const numberingKey = new PluginKey('listNumbering');

/** The first number of a numbered list (TipTap's `start`, 1 when unset). */
const firstNumber = (node) => (typeof node.attrs.start === 'number' ? node.attrs.start : 1);

/**
 * Where the numbered list before `index` in `parent` ends: its start plus
 * its number of items, i.e. the number the next list would continue with.
 * null when there's no numbered list before it at this level.
 */
function endOfListBefore(parent, index) {
    for (let i = index - 1; i >= 0; i--) {
        const child = parent.child(i);
        if (child.type.name === ORDERED) return firstNumber(child) + child.childCount;
    }
    return null;
}

/**
 * The corrections to make after a change, as [{ pos, start }]: the list at
 * `pos` in the new document should start at `start`.
 *
 * @param {import('@tiptap/pm/model').Node} oldDoc
 * @param {import('@tiptap/pm/model').Node} newDoc
 * @param {Mapping} mapping old positions -> new positions, for the whole change
 * @returns {Array<{pos: number, start: number}>}
 */
export function continuedNumbers(oldDoc, newDoc, mapping) {
    const back = mapping.invert();

    // The list a new list was before this change (same depth), or null.
    const originOf = (pos, depth) => {
        const oldInside = back.map(pos + 1, 1);
        if (oldInside < 0 || oldInside > oldDoc.content.size) return null;
        const $old = oldDoc.resolve(oldInside);
        if ($old.depth < depth || $old.node(depth).type.name !== ORDERED) return null;
        const $list = oldDoc.resolve($old.before(depth));
        return { node: $old.node(depth), pos: $old.before(depth), continued: endOfListBefore($list.parent, $list.index()) };
    };

    const fixes = [];
    // Check the children of one container (the document, a list item, a
    // quote…), top to bottom, carrying where the last numbered list ended.
    const checkChildren = (container, contentStart, depth) => {
        let prevEnd = null;
        const seen = new Set(); // old lists that already have a piece above
        container.forEach((child, offset) => {
            if (child.type.name !== ORDERED) return;
            const pos = contentStart + offset;
            const origin = originOf(pos, depth + 1);
            const ownStart = firstNumber(child);
            let continues = false;
            if (prevEnd !== null && origin && ownStart === firstNumber(origin.node)) {
                const piece = seen.has(origin.pos); // a lower piece of a split
                const wasContinuing = origin.continued !== null && firstNumber(origin.node) === origin.continued;
                continues = piece || wasContinuing;
            }
            const start = continues ? prevEnd : ownStart;
            if (start !== ownStart) fixes.push({ pos, start });
            prevEnd = start + child.childCount;
            if (origin) seen.add(origin.pos);
        });
    };

    checkChildren(newDoc, 0, 0);
    newDoc.descendants((node, pos) => {
        if (!node.isTextblock && node.childCount) checkChildren(node, pos + 1, newDoc.resolve(pos).depth + 1);
        return !node.isTextblock;
    });
    return fixes;
}

export const ListNumbering = Extension.create({
    name: 'listNumbering',

    addProseMirrorPlugins() {
        return [new Plugin({
            key: numberingKey,
            appendTransaction(transactions, oldState, newState) {
                if (!transactions.some((tr) => tr.docChanged)) return null;
                // Our own corrections don't need correcting.
                if (transactions.some((tr) => tr.getMeta(numberingKey))) return null;
                const mapping = new Mapping();
                transactions.forEach((tr) => mapping.appendMapping(tr.mapping));
                const fixes = continuedNumbers(oldState.doc, newState.doc, mapping);
                if (!fixes.length) return null;
                const tr = newState.tr;
                fixes.forEach(({ pos, start }) => {
                    const node = tr.doc.nodeAt(pos);
                    tr.setNodeMarkup(pos, null, { ...node.attrs, start });
                });
                return tr.setMeta(numberingKey, true);
            },
        })];
    },
});
