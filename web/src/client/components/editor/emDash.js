// Typing "--" in a note turns it into an em dash "—", the separator a quiz
// card's phrase and its English are joined with ("Yo estoy — I am",
// utils/quizCards.js).
//
// It's an input rule: TipTap watches what's typed and, when the text just
// before the cursor matches `find`, replaces it. So it only happens while
// typing (pasted text keeps its "--"), and never in code or a code block
// (TipTap skips input rules there). Backspace straight after it undoes it,
// giving "--" back.
//
// "---" at the start of a line still makes a divider line: the first two
// become "—", and StarterKit's horizontal rule also accepts "—-".
import { Extension, textInputRule } from '@tiptap/core';

export const EmDash = Extension.create({
    name: 'emDash',

    addInputRules() {
        return [textInputRule({ find: /--$/, replace: '—' })];
    },
});
