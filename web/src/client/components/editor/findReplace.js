import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Find and replace inside the note being edited (the 🔍 button or Cmd/Ctrl+F;
// the bar itself is in RichTextEditor). This extension finds the matches,
// tints them (yellow; the current one orange, see .rte-find in styles.css)
// and does the replacing.
//
// Matching ignores capitals, accents and Hebrew vowel marks, like notebook
// search, unless `exact` is on ([Aa]). A match can run across formatting
// (half of a word bold) but not across paragraphs, list items or cells, nor
// across a formula or picture in the middle of the text.
//
// Replacing keeps the formatting the matched text had, and each Replace or
// Replace all is one step for Undo.
export const findReplaceKey = new PluginKey('findReplace');

const EMPTY = { query: '', exact: false, matches: [], current: 0, decorations: DecorationSet.empty };

// Text folded for matching, with map[i] = offset in the original of folded
// character i (as in utils/highlightMatch.js).
function fold(text) {
    let folded = '';
    const map = [];
    let i = 0;
    for (const ch of text) {
        const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        for (const c of base) { folded += c; map.push(i); }
        i += ch.length;
    }
    return { folded, map };
}

// Every match of `query` in `doc`, in order: [{ from, to }] (document positions).
function findMatches(doc, query, exact) {
    const q = exact ? query : fold(query).folded;
    if (!q) return [];
    const out = [];
    doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        // The block's text, with pos[i] = document position of character i.
        // Anything that isn't text (a formula, a picture, a line break)
        // becomes a character no query contains, so nothing matches across it.
        let text = '';
        const at = [];
        node.forEach((child, offset) => {
            const start = pos + 1 + offset;
            if (child.isText) {
                for (let i = 0; i < child.text.length; i++) at.push(start + i);
                text += child.text;
            } else {
                at.push(start);
                text += '￼';
            }
        });
        const end = (i) => (i < at.length ? at[i] : pos + 1 + node.content.size);
        if (exact) {
            for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + q.length)) {
                out.push({ from: at[i], to: end(i + q.length) });
            }
        } else {
            const { folded, map } = fold(text);
            // The end is where the next letter starts, so vowel marks or
            // accents on the last letter are part of the match.
            for (let i = folded.indexOf(q); i !== -1; i = folded.indexOf(q, i + q.length)) {
                const stop = i + q.length < map.length ? map[i + q.length] : text.length;
                out.push({ from: at[map[i]], to: end(stop) });
            }
        }
        return false;
    });
    return out;
}

const decorate = (doc, matches, current) => DecorationSet.create(doc, matches.map((m, i) => (
    Decoration.inline(m.from, m.to, { class: i === current ? 'rte-find rte-find--current' : 'rte-find' })
)));

// The first match at or after `pos` (wrapping to the first), or 0.
const firstFrom = (matches, pos) => {
    const i = matches.findIndex((m) => m.from >= pos);
    return i === -1 ? 0 : i;
};

const FindReplacePlugin = () => new Plugin({
    key: findReplaceKey,
    state: {
        init: () => EMPTY,
        apply(tr, prev, oldState, newState) {
            const meta = tr.getMeta(findReplaceKey);
            if (!meta && !tr.docChanged) return prev;
            const next = { ...prev, ...(meta || {}) };
            if (!next.query) return { ...EMPTY, exact: next.exact };
            const searchChanged = meta && ('query' in meta || 'exact' in meta);
            if (searchChanged || tr.docChanged) {
                next.matches = findMatches(newState.doc, next.query, next.exact);
            }
            if (meta && typeof meta.current === 'number') {
                next.current = meta.current;
            } else if (meta && typeof meta.currentFrom === 'number') {
                next.current = firstFrom(next.matches, meta.currentFrom);
            } else if (searchChanged) {
                // A new search starts at the cursor, like a browser's find.
                next.current = firstFrom(next.matches, newState.selection.from);
            } else {
                // Typing elsewhere keeps the same match current.
                const old = prev.matches[prev.current];
                next.current = old ? firstFrom(next.matches, tr.mapping.map(old.from)) : 0;
            }
            const n = next.matches.length;
            next.current = n ? ((next.current % n) + n) % n : 0;
            delete next.currentFrom;
            next.decorations = decorate(newState.doc, next.matches, next.current);
            return next;
        },
    },
    props: {
        decorations: (state) => findReplaceKey.getState(state).decorations,
    },
});

export const FindReplace = Extension.create({
    name: 'findReplace',

    // onOpen: set by RichTextEditor, so Cmd/Ctrl+F in the note opens its bar.
    addStorage() {
        return { onOpen: null };
    },

    addProseMirrorPlugins() {
        return [FindReplacePlugin()];
    },

    addKeyboardShortcuts() {
        return {
            'Mod-f': () => {
                if (!this.storage.onOpen) return false;
                this.storage.onOpen();
                return true;
            },
        };
    },

    addCommands() {
        const state = (s) => findReplaceKey.getState(s);
        const step = (dir) => () => ({ state: s, tr, dispatch }) => {
            const { matches, current } = state(s);
            if (!matches.length) return false;
            if (dispatch) dispatch(tr.setMeta(findReplaceKey, { current: current + dir }));
            return true;
        };
        // The matched text replaced, keeping the formatting it had.
        const replaceRange = (tr, { from, to }, text) => {
            if (!text) return tr.delete(from, to);
            const marks = tr.doc.resolve(from).marksAcross(tr.doc.resolve(to)) || [];
            return tr.replaceWith(from, to, tr.doc.type.schema.text(text, marks));
        };
        return {
            setFindQuery: (query, exact) => ({ tr, dispatch }) => {
                if (dispatch) dispatch(tr.setMeta(findReplaceKey, { query: query || '', exact: !!exact }));
                return true;
            },
            findNext: step(1),
            findPrevious: step(-1),
            // Replace the current match, then go on to the one after it.
            replaceMatch: (text) => ({ state: s, tr, dispatch }) => {
                const { matches, current } = state(s);
                const m = matches[current];
                if (!m) return false;
                if (dispatch) {
                    replaceRange(tr, m, text);
                    dispatch(tr.setMeta(findReplaceKey, { currentFrom: m.from + (text || '').length }));
                }
                return true;
            },
            // Every match at once, last to first so earlier positions hold.
            replaceAllMatches: (text) => ({ state: s, tr, dispatch }) => {
                const { matches } = state(s);
                if (!matches.length) return false;
                if (dispatch) {
                    for (let i = matches.length - 1; i >= 0; i--) replaceRange(tr, matches[i], text);
                    dispatch(tr);
                }
                return true;
            },
            // Close: no more tints; the cursor goes to the current match.
            closeFind: () => ({ state: s, tr, dispatch }) => {
                const m = state(s).matches[state(s).current];
                if (dispatch) {
                    tr.setMeta(findReplaceKey, { query: '' });
                    if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
                    dispatch(tr.scrollIntoView());
                }
                return true;
            },
        };
    },
});

export default FindReplace;
