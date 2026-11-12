import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';

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
//   orderedList  [5 … 12]       the items after (same kind), start = 2
//
// The numbers below continue from the numbered items above, and bullets
// don't count (the user's choice, as Google Docs does): after items 2–4
// become bullets, the old item 5 is "2.". The list's other settings (its
// indent level, see indent.js) are kept on every part.
//
// Restarting at 1: a numbered list that continues from above (it starts
// at, say, 8, after an item was taken out: editor/listNumbering.js) starts
// at 1 again when you select its first item and click "1. List". Clicking
// again then takes the items out of the list, as before. A cycle, so no
// extra button is needed (the user's choice).
//
// Everything else is left to TipTap's command, unchanged:
//   - the selection is not in a list: it becomes a list
//   - the items are already that kind: they leave the list (become text)
//   - the whole list is selected: the whole list switches kind
//   - a selection reaching outside the list (text above or below it),
//     unless it includes a list of the other kind: wrapKeepingOtherLists
//     keeps that one as it is
//   - a selection starting inside a list nested in the one it covers acts
//     on the outer list (reachesIntoInnerList), not the nested one
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
    // "1. List" on the first item of a numbered list that doesn't start at 1:
    // restart it at 1 (the next click takes the items out).
    if (typeName === 'orderedList' && list.type.name === typeName && start === 0
        && typeof list.attrs.start === 'number' && list.attrs.start !== 1) {
        if (dispatch) {
            tr.setNodeMarkup(pos, null, { ...list.attrs, start: 1 });
            dispatch(tr);
        }
        return true;
    }
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
    if (end < count) parts.push(list.type.create(attrsFor(list.type, firstNumber + start), items(end, count)));

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

/**
 * The innermost list around a position, as its start position, or null.
 * @param {import('@tiptap/pm/model').ResolvedPos} $pos
 */
function innermostListPos($pos) {
    for (let d = $pos.depth; d > 0; d--) {
        if (LIST_TYPES.includes($pos.node(d).type.name)) return $pos.before(d);
    }
    return null;
}

/**
 * The selection starts (or ends) inside a list nested in the list it
 * covers, e.g. from "Mabel" (a bullet under item 1) to item 2. TipTap's
 * own command would act on that inner list (turning the bullets into
 * numbers); this makes the button act on the outer list's items instead,
 * and the inner list goes along unchanged.
 */
function reachesIntoInnerList(state, typeName) {
    const found = selectedItems(state);
    if (!found || found.list.type.name !== typeName) return false;
    const { $from, $to } = state.selection;
    return innermostListPos($from) !== found.pos || innermostListPos($to) !== found.pos;
}

/**
 * Make the selected lines a list of `typeName` while lists of the OTHER
 * kind inside the selection keep their kind and indent: "1. List" on some
 * plain lines with an indented bulleted list among them numbers the lines
 * and leaves the bullets as bullets (nested under the numbered line above
 * them, when there is one). Without this, a selection starting inside the
 * bullets turned them into numbered items and dropped their indent.
 *
 * Runs only when the selection reaches beyond a single list AND includes a
 * list of the other kind; everything else is TipTap's normal command.
 * How: the blocks the selection touches (at the level they share) are
 * rebuilt as:
 *   plain line (paragraph, heading)  -> a new item (as a paragraph)
 *   list of this kind                -> its items join the new list
 *   list of the other kind           -> kept as it is, inside the item above
 *                                       (or on its own when there's none)
 *   anything else (code, table, …)   -> kept; the list continues after it
 *
 * @param {'bulletList'|'orderedList'} typeName
 */
export const wrapKeepingOtherLists = (typeName) => ({ state, tr, dispatch }) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range || LIST_TYPES.includes(range.parent.type.name)) return false;
    const blocks = [];
    for (let i = range.startIndex; i < range.endIndex; i++) blocks.push(range.parent.child(i));
    const isOther = (node) => LIST_TYPES.includes(node.type.name) && node.type.name !== typeName;
    if (!blocks.some(isOther)) return false;

    const schema = state.schema;
    const listType = schema.nodes[typeName];
    const itemType = schema.nodes.listItem;
    const paragraph = schema.nodes.paragraph;
    const numbered = 'start' in (listType.spec.attrs || {});

    const out = [];
    let items = []; // the items of the list being built
    let nextNumber = 1;
    const flush = () => {
        if (!items.length) return;
        out.push(listType.create(numbered ? { start: nextNumber } : null, items));
        nextNumber += items.length;
        items = [];
    };
    blocks.forEach((block) => {
        if (block.isTextblock) {
            // A line becomes an item; list items hold paragraphs, so a
            // heading becomes a paragraph (as TipTap's own command does).
            const attrs = block.type === paragraph ? { ...block.attrs } : null;
            if (attrs && 'indent' in attrs) attrs.indent = 0; // the list does the indenting now
            items.push(itemType.create(null, paragraph.create(attrs, block.content, block.marks)));
        } else if (block.type === listType) {
            block.forEach((item) => items.push(item));
        } else if (isOther(block) && items.length) {
            // Nest it in the item above, after that item's own content.
            const last = items[items.length - 1];
            items[items.length - 1] = last.copy(last.content.append(Fragment.from(block)));
        } else {
            flush();
            out.push(block);
        }
    });
    flush();

    if (dispatch) {
        tr.replaceWith(range.start, range.end, out);
        const size = out.reduce((n, node) => n + node.nodeSize, 0);
        tr.setSelection(TextSelection.between(tr.doc.resolve(range.start), tr.doc.resolve(range.start + size)));
        dispatch(tr.scrollIntoView());
    }
    return true;
};

/**
 * The kind of list the cursor (the selection's start) is directly in, or
 * null outside a list. The toolbar lights up only that kind's button: in
 * bullets under a numbered item, "• List" is lit and "1. List" isn't
 * (TipTap's isActive counts every list around the cursor, so both were).
 * @param {import('@tiptap/pm/state').EditorState} state
 * @returns {'bulletList'|'orderedList'|null}
 */
export function innermostListType(state) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name;
        if (LIST_TYPES.includes(name)) return name;
    }
    return null;
}

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
            toggleListOnSelection: (typeName) => ({ state, tr, dispatch, commands }) => {
                const props = { state, tr, dispatch };
                if (toggleListPart(typeName)(props)) return true;
                if (wrapKeepingOtherLists(typeName)(props)) return true;
                // Already this kind, from inside a nested list: take the
                // outer items out of the list (their nested lists go along).
                if (reachesIntoInnerList(state, typeName)) return commands.liftListItem('listItem');
                return commands[TOGGLES[typeName]]();
            },
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
