import { Extension } from '@tiptap/core';

// Indent / outdent for block text (paragraphs and headings). List items are
// handled separately by the toolbar via sink/liftListItem; this covers the rest
// by storing an `indent` level (0..MAX) rendered as a left margin. The inline
// `margin-left` style survives DOMPurify, so indentation persists when saved.
const STEP = 24; // px per level
const MAX = 10;

export const Indent = Extension.create({
    name: 'indent',

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
        }];
    },

    addCommands() {
        const shift = (delta) => ({ state, tr, dispatch }) => {
            const { from, to } = state.selection;
            let changed = false;
            state.doc.nodesBetween(from, to, (node, pos) => {
                if (!this.options.types.includes(node.type.name)) return;
                const cur = node.attrs.indent || 0;
                const next = Math.max(0, Math.min(MAX, cur + delta));
                if (next !== cur) {
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
                    changed = true;
                }
            });
            if (changed && dispatch) dispatch(tr);
            return changed;
        };
        return {
            indentMore: () => shift(1),
            indentLess: () => shift(-1),
        };
    },
});

export default Indent;
