// Paste handling for the note editor: turns pasted Markdown into formatted
// content. Works together with the Markdown extension from @tiptap/markdown,
// which supplies the parser (editor.markdown) and lets insertContent accept
// { contentType: 'markdown' }.
//
// How pasting works in ProseMirror (the engine under TipTap)
// ----------------------------------------------------------
// A paste puts up to two versions of the copied content on the clipboard:
//   text/html   the formatted version, e.g. a real <table> copied from a web
//               page, a chat app or Google Docs
//   text/plain  the same content as plain text. For content copied from a
//               Markdown source this *is* Markdown: "| a | b |", "**bold**"
// By default ProseMirror uses text/html when present and otherwise inserts
// text/plain as-is, so Markdown shows up as literal pipes and asterisks.
//
// A plugin can intercept this with `handlePaste`: return true to say "I
// handled it" (ProseMirror then does nothing more), false to let the normal
// paste run. That's all this extension does:
//
//   Markdown mode ON  (the "M↓" toolbar toggle)
//       Always read text/plain and parse it as Markdown: headings, lists,
//       bold/italic, links, code, tables. Useful when the text/html version
//       is poor, or there is none.
//   Markdown mode OFF (default)
//       Leave the normal paste alone — HTML tables now paste correctly
//       because TableKit adds tables to the editor's schema. The one extra:
//       a plain-text paste (no HTML) that contains a Markdown pipe table is
//       parsed as Markdown, since pipes-as-text is never what anyone wants.
//
// Either way, pasting inside a code block stays literal text.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * A Markdown pipe table: a line with at least one "|", followed by the
 * divider line under the header, e.g. "|---|:--:|---|" or "--- | ---".
 * The `m` flag makes ^ and $ match at every line break, so this finds a
 * table anywhere inside a longer paste.
 */
const PIPE_TABLE = /^[^\n]*\|[^\n]*\n[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m;

/**
 * True when `text` contains a Markdown pipe table. Exported for tests.
 * @param {string} text
 */
export function containsPipeTable(text) {
    return PIPE_TABLE.test(text || '');
}

export const MarkdownPaste = Extension.create({
    name: 'markdownPaste',

    // Extension storage: per-editor state that the plugin below and the
    // toolbar button can both reach, as editor.storage.markdownPaste.
    addStorage() {
        return { enabled: false };
    },

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            new Plugin({
                key: new PluginKey('markdownPaste'),
                props: {
                    handlePaste: (view, event) => {
                        const clipboard = event.clipboardData;
                        const text = clipboard ? clipboard.getData('text/plain') : '';
                        // No text, or the Markdown extension isn't loaded:
                        // nothing to do, use the normal paste.
                        if (!text || !editor.markdown) return false;
                        // Inside a code block, pasted text should stay literal.
                        if (editor.isActive('codeBlock')) return false;

                        const markdownMode = editor.storage.markdownPaste.enabled;
                        const hasHtml = Boolean(clipboard.getData('text/html'));
                        const plainTextTable = !hasHtml && containsPipeTable(text);
                        if (!markdownMode && !plainTextTable) return false;

                        editor.commands.insertContent(text, { contentType: 'markdown' });
                        return true;
                    },
                },
            }),
        ];
    },
});
