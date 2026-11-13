import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';

// Pasted formulas written with LaTeX's own brackets become real formulas.
//
// The editor shows formulas (KaTeX, via the Mathematics extension) and lets
// you type them as $…$ (in a line) or $$…$$ (on their own line). Text from
// ChatGPT and similar tools marks formulas the other standard way:
//
//   \[ 980 \times 8.79\% \]     a formula on its own line ("display")
//   \( x^2 \)                   a formula inside a sentence ("inline")
//
// Pasted as is, those stayed raw text. This turns them into formulas while
// the paste happens, leaving everything else as the normal paste made it.
//
// How: ProseMirror lets a plugin rewrite what's about to be pasted
// (`transformPasted`). It receives a Slice, the pasted piece of document,
// and returns a new one. We walk its blocks:
//   - a paragraph that is just \[ … \]           -> a block formula
//   - paragraphs "\[", the formula, "\]" (the brackets on their own lines,
//     as a plain-text paste of a multi-line formula arrives) -> one block
//   - \( … \) or \[ … \] inside a sentence        -> an inline formula
// A block formula can't stand everywhere (a list item must start with a
// paragraph, for example); there it becomes an inline formula instead.
//
// Inside a code block nothing changes: there, a backslash is just code.
const OPEN = '\\[';
const CLOSE = '\\]';
// \( … \) or \[ … \] within a line. Lazy (.+?), so two formulas on one
// line stay two.
const INLINE_MATH = /\\\((.+?)\\\)|\\\[(.+?)\\\]/g;
// A paragraph that is one display formula and nothing else.
const WHOLE_BLOCK = /^\s*\\\[([\s\S]+?)\\\]\s*$/;

/**
 * Rewrite one run of text, turning \( … \) / \[ … \] into inline formulas.
 * @param {import('@tiptap/pm/model').Node} textNode
 * @param {import('@tiptap/pm/model').Schema} schema
 * @returns {import('@tiptap/pm/model').Node[]} the replacement nodes
 */
function splitInline(textNode, schema) {
    const text = textNode.text;
    const out = [];
    let last = 0;
    INLINE_MATH.lastIndex = 0;
    let m;
    while ((m = INLINE_MATH.exec(text))) {
        const latex = (m[1] || m[2] || '').trim();
        if (!latex) continue;
        if (m.index > last) out.push(schema.text(text.slice(last, m.index), textNode.marks));
        out.push(schema.nodes.inlineMath.create({ latex }));
        last = m.index + m[0].length;
    }
    if (!out.length) return [textNode];
    if (last < text.length) out.push(schema.text(text.slice(last), textNode.marks));
    return out;
}

/**
 * The pasted blocks inside `fragment`, with formulas made real.
 * @param {Fragment} fragment
 * @param {import('@tiptap/pm/model').NodeType|null} parentType where these
 *   blocks sit (null: the top of the paste), to know if a block formula fits
 * @param {import('@tiptap/pm/model').Schema} schema
 * @returns {Fragment}
 */
export function convertFragment(fragment, parentType, schema) {
    const blockMath = schema.nodes.blockMath;
    const inlineMath = schema.nodes.inlineMath;
    if (!blockMath || !inlineMath) return fragment;

    const out = [];
    const children = [];
    fragment.forEach((child) => children.push(child));

    for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node.type.name === 'codeBlock') { out.push(node); continue; }

        if (node.type.name === 'paragraph') {
            const text = node.textContent;
            const onlyText = node.childCount > 0 && node.content.content.every((n) => n.isText);
            // "\[" on its own line, the formula, then "\]": one block formula.
            if (onlyText && text.trim() === OPEN) {
                const end = children.findIndex((c, j) => j > i && c.type.name === 'paragraph' && c.textContent.trim() === CLOSE);
                if (end !== -1) {
                    const latex = children.slice(i + 1, end).map((c) => c.textContent).join('\n').trim();
                    if (latex) {
                        out.push(blockMath.create({ latex }));
                        i = end;
                        continue;
                    }
                }
            }
            // A paragraph that is just \[ … \].
            const whole = onlyText && WHOLE_BLOCK.exec(text);
            if (whole) {
                out.push(blockMath.create({ latex: whole[1].trim() }));
                continue;
            }
            // Formulas inside the sentence.
            const inline = [];
            node.forEach((n) => { inline.push(...(n.isText ? splitInline(n, schema) : [n])); });
            out.push(node.copy(Fragment.from(inline)));
            continue;
        }

        if (node.isTextblock) { out.push(node); continue; } // headings etc. stay as they are
        if (node.childCount) {
            out.push(node.copy(convertFragment(node.content, node.type, schema)));
            continue;
        }
        out.push(node);
    }

    // Where a block formula isn't allowed (e.g. as a list item's first
    // block), put it in a paragraph as an inline formula instead.
    let result = Fragment.from(out);
    if (parentType && !parentType.validContent(result)) {
        result = Fragment.from(out.map((n) => (n.type === blockMath
            ? schema.nodes.paragraph.create(null, inlineMath.create({ latex: n.attrs.latex }))
            : n)));
    }
    return result;
}

export const LatexPaste = Extension.create({
    name: 'latexPaste',

    addProseMirrorPlugins() {
        const editor = this.editor;
        return [new Plugin({
            key: new PluginKey('latexPaste'),
            props: {
                transformPasted(slice) {
                    if (editor.isActive('codeBlock')) return slice;
                    const content = convertFragment(slice.content, null, editor.schema);
                    // A slice can be "open" at its edges: pasted into the
                    // middle of a line, its first paragraph's text joins that
                    // line. A formula block can't be joined like that, so an
                    // edge that became one is closed.
                    const changed = (a, b) => a && b && a.type !== b.type;
                    const openStart = changed(content.firstChild, slice.content.firstChild) ? 0 : slice.openStart;
                    const openEnd = changed(content.lastChild, slice.content.lastChild) ? 0 : slice.openEnd;
                    return new Slice(content, openStart, openEnd);
                },
            },
        })];
    },
});
