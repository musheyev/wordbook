// Table cells that ignore a broken colspan / rowspan when a table is pasted
// in (or a saved note is opened for editing).
//
// Why: tables copied from Gemini come with cells like
//   <td colspan="undefined">
// TipTap's own cells keep that value as the text "undefined". When the table
// is saved, TipTap works out its width by adding up each cell's columns, and
// "undefined" columns add up to nothing, so the saved table says
// `style="width: 0px"`. The editor redraws tables itself, so it looked fine
// while editing, but the saved note showed a blank gap where the table was.
//
// These cells read colspan / rowspan as a whole number of 1 or more, and use
// 1 for anything else. A note saved with a broken table is mended the next
// time it's edited and saved. (Notes are also mended for display:
// utils/sanitize.js.)

import { TableCell, TableHeader } from '@tiptap/extension-table';

/**
 * A colspan / rowspan attribute as a number: 1 unless it's a whole number ≥ 1.
 * @param {string|null} value the attribute as written in the HTML
 * @returns {number}
 */
export function spanFrom(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : 1;
}

const spanAttributes = {
    colspan: { default: 1, parseHTML: (el) => spanFrom(el.getAttribute('colspan')) },
    rowspan: { default: 1, parseHTML: (el) => spanFrom(el.getAttribute('rowspan')) },
};

export const SafeTableCell = TableCell.extend({
    addAttributes() {
        return { ...this.parent?.(), ...spanAttributes };
    },
});

export const SafeTableHeader = TableHeader.extend({
    addAttributes() {
        return { ...this.parent?.(), ...spanAttributes };
    },
});
