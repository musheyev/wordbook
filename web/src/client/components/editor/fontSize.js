import { Extension } from '@tiptap/core';

// Font size, added as an attribute on the TextStyle mark (so it composes with
// font-family). Renders as an inline `font-size` style that survives DOMPurify.
// Requires @tiptap/extension-text-style to be loaded (for the textStyle mark
// and removeEmptyTextStyle).
export const FontSize = Extension.create({
    name: 'fontSize',

    addOptions() {
        return { types: ['textStyle'] };
    },

    addGlobalAttributes() {
        return [{
            types: this.options.types,
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: (el) => el.style.fontSize || null,
                    renderHTML: (attrs) => (attrs.fontSize
                        ? { style: `font-size: ${attrs.fontSize}` }
                        : {}),
                },
            },
        }];
    },

    addCommands() {
        return {
            setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
            unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        };
    },
});

export default FontSize;
