import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';

// Indent / outdent.
//
// Paragraphs and headings store an `indent` level (0..MAX), rendered as a left
// margin. The inline `margin-left` style survives DOMPurify, so indentation
// persists when saved.
//
// List items nest and un-nest via the toolbar (sink/liftListItem). A list as a
// whole (bullet or numbered) also has an `indent` level, used for the cases
// where nesting can't apply: outdenting a top-level list moves the whole list
// left instead of turning its items into plain text (down to its default
// position, then it stops), and indenting an item that can't nest (the first
// item, or the whole list selected) moves the whole list right. Lists have a
// default margin of LIST_BASE (styles.css), so their levels add to it.
//
// Notes saved with the older, larger steps (24px; lists at 22px) keep their
// spacing when viewed; opening one in the editor snaps it to these steps.
const STEP = 16; // px per level
const MAX = 10;
const LIST_TYPES = ['bulletList', 'orderedList'];
const LIST_BASE = 4; // default list margin-left in px, see the note list rules in styles.css
const LIST_MIN = 0;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The outermost list containing a position, as { node, pos }, or null.
function outermostList($pos) {
    for (let d = 1; d <= $pos.depth; d++) {
        const node = $pos.node(d);
        if (LIST_TYPES.includes(node.type.name)) return { node, pos: $pos.before(d) };
    }
    return null;
}

// How many lists contain a position: 0 outside a list, 1 in a top-level list,
// 2 or more in a nested one.
export function listNesting($pos) {
    let lists = 0;
    for (let d = 1; d <= $pos.depth; d++) {
        if (LIST_TYPES.includes($pos.node(d).type.name)) lists++;
    }
    return lists;
}

/**
 * ⇤ (and Shift-Tab) on items of a list nested inside a list of the OTHER
 * kind: bullets under a numbered item, or numbers under a bullet. They move
 * one level left and keep their kind. One list can't hold both kinds at the
 * same level, so the outer list splits around them:
 *
 *   1. Deal Cloud                  1. Deal Cloud
 *        • Mabel          ⇤        • Mabel
 *        • Pipeline      --->      • Pipeline
 *   2. Dagster                     2. Dagster
 *
 * The numbered part below continues from the one above; the bullets don't
 * count (the user's choice). Without this, the editor's usual "un-nest"
 * moved the items into the outer list, where they took its kind and
 * became numbers.
 *
 * Bullets above the selection stay nested under their item; bullets below
 * it go along, nested under the last moved one (as the usual un-nest does).
 * Returns false (doing nothing) when the lists are the same kind, so the
 * usual un-nest runs.
 */
export const outdentKeepingKind = ({ state, tr, dispatch }) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => LIST_TYPES.includes(node.type.name));
    if (!range) return false;
    const listDepth = range.depth; // the inner list's depth
    if (listDepth < 3) return false; // not nested in another list
    const inner = range.parent;
    const item = $from.node(listDepth - 1);
    const outer = $from.node(listDepth - 2);
    if (item.type.name !== 'listItem' || !LIST_TYPES.includes(outer.type.name)) return false;
    if (outer.type === inner.type) return false; // same kind: the usual un-nest

    const outerPos = $from.before(listDepth - 2);
    const itemIndex = $from.index(listDepth - 2); // the item's place in the outer list
    const innerIndex = $from.index(listDepth - 1); // the inner list's place in the item
    const kids = (node, from, to) => {
        const out = [];
        for (let i = from; i < to; i++) out.push(node.child(i));
        return out;
    };

    const before = kids(inner, 0, range.startIndex);
    const moved = kids(inner, range.startIndex, range.endIndex);
    const after = kids(inner, range.endIndex, inner.childCount);
    // The items below the selection ride along, nested in the last moved one.
    if (after.length) {
        const last = moved[moved.length - 1];
        moved[moved.length - 1] = last.copy(last.content.addToEnd(inner.copy(Fragment.from(after))));
    }
    // The item keeps its own text and the bullets above the selection.
    const itemKids = kids(item, 0, item.childCount);
    if (before.length) itemKids[innerIndex] = inner.copy(Fragment.from(before));
    else itemKids.splice(innerIndex, 1);
    const newItem = item.copy(Fragment.from(itemKids));

    const head = outer.copy(Fragment.from([...kids(outer, 0, itemIndex), newItem]));
    // The moved list sits where the outer list is, at its indent.
    const movedList = inner.type.create({ ...inner.attrs, indent: outer.attrs.indent || 0 }, moved);
    const parts = [head, movedList];
    const rest = kids(outer, itemIndex + 1, outer.childCount);
    if (rest.length) {
        const attrs = { ...outer.attrs };
        if ('start' in attrs) {
            const first = typeof outer.attrs.start === 'number' ? outer.attrs.start : 1;
            attrs.start = first + head.childCount; // the bullets don't count
        }
        parts.push(outer.type.create(attrs, rest));
    }

    if (dispatch) {
        // Where the moved items start, before and after, to keep the same
        // text selected.
        const oldStart = range.start;
        const newStart = outerPos + head.nodeSize + 1;
        tr.replaceWith(outerPos, outerPos + outer.nodeSize, parts);
        const map = (pos) => newStart + (pos - oldStart);
        tr.setSelection(TextSelection.create(tr.doc, map(state.selection.from), map(state.selection.to)));
        dispatch(tr.scrollIntoView());
    }
    return true;
};

export const Indent = Extension.create({
    name: 'indent',
    // Above the list extensions (100), so our Tab / Shift-Tab run first.
    priority: 110,

    addOptions() {
        return { types: ['paragraph', 'heading'] };
    },

    addGlobalAttributes() {
        return [{
            types: this.options.types,
            attributes: {
                indent: {
                    default: 0,
                    parseHTML: (el) => {
                        const ml = parseInt(el.style.marginLeft, 10);
                        return ml ? Math.round(ml / STEP) : 0;
                    },
                    renderHTML: (attrs) => (attrs.indent
                        ? { style: `margin-left: ${attrs.indent * STEP}px` }
                        : {}),
                },
            },
        }, {
            types: LIST_TYPES,
            attributes: {
                indent: {
                    default: 0,
                    parseHTML: (el) => {
                        if (el.style.marginLeft === '') return 0;
                        const ml = parseInt(el.style.marginLeft, 10) || 0;
                        return clamp(Math.round((ml - LIST_BASE) / STEP), LIST_MIN, MAX);
                    },
                    renderHTML: (attrs) => (attrs.indent
                        ? { style: `margin-left: ${Math.max(0, LIST_BASE + attrs.indent * STEP)}px` }
                        : {}),
                },
            },
        }];
    },

    addCommands() {
        const shift = (delta) => ({ state, tr, dispatch }) => {
            const { from, to } = state.selection;
            let changed = false;
            state.doc.nodesBetween(from, to, (node, pos) => {
                if (!this.options.types.includes(node.type.name)) return;
                const cur = node.attrs.indent || 0;
                const next = clamp(cur + delta, 0, MAX);
                if (next !== cur) {
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
                    changed = true;
                }
            });
            if (changed && dispatch) dispatch(tr);
            return changed;
        };
        // Move the whole (outermost) list around the selection. False when
        // there's no list or it's already at the limit.
        const shiftList = (delta) => ({ state, tr, dispatch }) => {
            const list = outermostList(state.selection.$from);
            if (!list) return false;
            const cur = list.node.attrs.indent || 0;
            const next = clamp(cur + delta, LIST_MIN, MAX);
            if (next === cur) return false;
            tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, indent: next });
            if (dispatch) dispatch(tr);
            return true;
        };
        return {
            indentMore: () => shift(1),
            indentLess: () => shift(-1),
            listIndentMore: () => shiftList(1),
            listIndentLess: () => shiftList(-1),
            // The toolbar's ⇥ / ⇤ inside a list (also Tab / Shift-Tab).
            // A list item nests or un-nests where it can; otherwise the whole
            // top-level list moves, so outdenting never turns items into text.
            listAwareIndent: () => ({ state, commands }) => {
                const nesting = listNesting(state.selection.$from);
                return commands.sinkListItem('listItem') || (nesting === 1 && commands.listIndentMore());
            },
            // Items in a list of the other kind (bullets under a number)
            // move left and keep their kind (outdentKeepingKind).
            listAwareOutdent: () => ({ state, tr, dispatch, commands }) => (
                listNesting(state.selection.$from) > 1
                    ? outdentKeepingKind({ state, tr, dispatch }) || commands.liftListItem('listItem')
                    : commands.listIndentLess()
            ),
        };
    },

    addKeyboardShortcuts() {
        const inList = () => listNesting(this.editor.state.selection.$from) > 0;
        return {
            // Tab falls through (moving focus out) when nothing can change,
            // as before.
            Tab: () => inList() && this.editor.commands.listAwareIndent(),
            // Shift-Tab in a list is always handled here, even at the left
            // limit, so it never reaches the list extension's "lift out of
            // the list".
            'Shift-Tab': () => {
                if (!inList()) return false;
                this.editor.commands.listAwareOutdent();
                return true;
            },
        };
    },
});

export default Indent;
