import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

// The "• List" and "1. List" buttons (and their shortcuts, ⌘⇧8 / ⌘⇧7),
// changing only the items you selected.
//
// TipTap's own toggleBulletList / toggleOrderedList, used inside a list of
// the other kind, change the type of the WHOLE list: select items 2–4 of a
// numbered list, click "• List", and all twelve items become bullets. Word
// and Google Docs change just the selected items, and so does this.
//
// How: a ProseMirror document is a tree. A list is a node (bulletList or
// orderedList) whose children are listItem nodes. To change items 2–4 of a
// 12-item numbered list, the one list node is replaced by up to three:
//
//   orderedList  [1]            the items before the selection (same kind)
//   bulletList   [2, 3, 4]      the selected items, in the new kind
//   orderedList  [5 … 12]       the items after (same kind), start = 5
//
// The numbers after the change continue where they were (the user's
// choice): item 5 is still "5.", because the bottom part's `start` counts
// the items above it, bullets included. The list's other settings (its
// indent level, see indent.js) are kept on every part.
//
// Everything else is left to TipTap's command, unchanged:
//   - the selection is not in a list: it becomes a list
//   - the items are already that kind: they leave the list (become text)
//   - the whole list is selected: the whole list switches kind
//   - a selection reaching outside the list (text above or below it)
const LIST_TYPES = ['bulletList', 'orderedList'];
const TOGGLES = { bulletList: 'toggleBulletList', orderedList: 'toggleOrderedList' };

/**
 * The innermost list holding the whole selection, with which of its items
 * the selection covers; null when the selection isn't inside one list.
 *
 * $from.blockRange($to, pred) finds the deepest node both ends share whose
 * children the selection spans; `pred` keeps looking outward until that node
 * is a list. startIndex/endIndex are the first covered child and one past
 * the last.
 *
 * @param {import('@tiptap/pm/state').EditorState} state
 * @returns {{list: import('@tiptap/pm/model').Node, pos: number, start: number, end: number}|null}
 */
function selectedItems(state) {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => LIST_TYPES.includes(node.type.name));
    if (!range) return null;
    return {
        list: range.parent,
        // The list's own position: just before its opening token.
        pos: range.$from.before(range.depth),
        start: range.startIndex,
        end: range.endIndex,
    };
}

/**
 * Replace part of a list with a list of another kind (see the top of the
 * file). Returns false (doing nothing) when TipTap's own command should run.
 *
 * @param {string} typeName 'bulletList' | 'orderedList'
 */
export const toggleListPart = (typeName) => ({ state, tr, dispatch }) => {
    const found = selectedItems(state);
    if (!found) return false;
    const { list, pos, start, end } = found;
    const count = list.childCount;
    if (list.type.name === typeName) return false; // already that kind: TipTap lifts them out
    if (start === 0 && end === count) return false; // the whole list: TipTap switches it

    const schema = state.schema;
    const newType = schema.nodes[typeName];
    const items = (from, to) => {
        const out = [];
        for (let i = from; i < to; i++) out.push(list.child(i));
        return out;
    };
    // Attributes for a part: the list's own (indent level…), with `start`
    // only where the kind has it (numbered lists).
    const attrsFor = (type, startAt) => {
        const attrs = {};
        Object.keys(type.spec.attrs || {}).forEach((key) => {
            if (key in list.attrs) attrs[key] = list.attrs[key];
        });
        if ('start' in (type.spec.attrs || {})) attrs.start = startAt;
        return attrs;
    };
    const firstNumber = typeof list.attrs.start === 'number' ? list.attrs.start : 1;

    const parts = [];
    if (start > 0) parts.push(list.type.create(attrsFor(list.type, firstNumber), items(0, start)));
    parts.push(newType.create(attrsFor(newType, 1), items(start, end)));
    if (end < count) parts.push(list.type.create(attrsFor(list.type, firstNumber + end), items(end, count)));

    if (dispatch) {
        const { from, to } = state.selection;
        tr.replaceWith(pos, pos + list.nodeSize, parts);
        // Keep the same text selected. With a part above, the selected items
        // moved by two tokens (that part's closing and the new list's
        // opening); without one, they didn't move.
        const shift = start > 0 ? 2 : 0;
        tr.setSelection(TextSelection.create(tr.doc, from + shift, to + shift));
        dispatch(tr.scrollIntoView());
    }
    return true;
};

export const ListSplit = Extension.create({
    name: 'listSplit',

    addCommands() {
        return {
            /**
             * Make the selected items a bullet / numbered list: only those
             * items when they're part of a list of the other kind, otherwise
             * exactly what TipTap's toggleBulletList / toggleOrderedList do.
             * @param {'bulletList'|'orderedList'} typeName
             */
            toggleListOnSelection: (typeName) => ({ commands, ...props }) =>
                toggleListPart(typeName)(props) || commands[TOGGLES[typeName]](),
        };
    },

    // The same for the keyboard shortcuts. A higher priority than the list
    // extensions' own, so these run first.
    priority: 200,
    addKeyboardShortcuts() {
        return {
            'Mod-Shift-8': () => this.editor.commands.toggleListOnSelection('bulletList'),
            'Mod-Shift-7': () => this.editor.commands.toggleListOnSelection('orderedList'),
        };
    },
});
