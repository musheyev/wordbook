import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// A few LaTeX examples shown while editing a formula: "type this" → "get this".
const MATH_EXAMPLES = [
    { tex: '\\frac{a}{b}', label: 'fraction' },
    { tex: 'x^{2}', label: 'power' },
    { tex: 'a_{i}', label: 'subscript' },
    { tex: '\\sqrt{x}', label: 'root' },
    { tex: 'ACR = \\frac{Assets}{Debt} + 1', label: 'equation' },
];

const renderTex = (tex) => {
    try {
        return katex.renderToString(tex, { throwOnError: false, displayMode: false });
    } catch (e) {
        return tex;
    }
};

// Rich-text editor for card bodies. Built on TipTap (ProseMirror). StarterKit
// (v3) bundles bold, italic, underline, code, code block, headings, lists,
// link and undo/redo. Mathematics adds KaTeX-rendered LaTeX: type $…$ inline or
// $$…$$ for a block, or use the fx button.
const RichTextEditor = ({ value, onChange }) => {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                link: {
                    openOnClick: false,
                    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
                },
            }),
            Mathematics.configure({
                inlineOptions: { katexOptions: { throwOnError: false } },
                blockOptions: { katexOptions: { throwOnError: false } },
            }),
        ],
        content: value || '',
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    // Re-render on selection changes too (not just document changes), so
    // clicking a formula to select it opens the LaTeX editor, and the editor's
    // controlled textarea reflects live edits.
    const [, forceRerender] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => {
        if (!editor) return undefined;
        const handler = () => forceRerender();
        editor.on('selectionUpdate', handler);
        editor.on('transaction', handler);
        return () => {
            editor.off('selectionUpdate', handler);
            editor.off('transaction', handler);
        };
    }, [editor]);

    if (!editor) {
        return null;
    }

    // "Formula editor mode": a math node is selected.
    const mathType = editor.isActive('blockMath')
        ? 'blockMath'
        : (editor.isActive('inlineMath') ? 'inlineMath' : null);
    const currentLatex = mathType ? (editor.getAttributes(mathType).latex || '') : '';

    const updateLatex = (latex) => {
        if (mathType === 'blockMath') editor.commands.updateBlockMath({ latex });
        else if (mathType === 'inlineMath') editor.commands.updateInlineMath({ latex });
    };

    // Insert a starter block formula and select it so the LaTeX editor opens.
    const insertFormula = () => {
        editor.chain().focus().insertBlockMath({ latex: '\\frac{a}{b}' }).run();
        const pos = editor.state.selection.from - 1;
        if (pos >= 0) editor.chain().setNodeSelection(pos).run();
    };

    // Leave formula mode: drop the node selection and place the caret just after
    // the current formula so the user can keep typing text.
    const exitFormula = () => {
        editor.chain().focus().setTextSelection(editor.state.selection.to).run();
    };

    // fx toggles: insert a formula when in text, or step back out to text when
    // already editing one.
    const onFxClick = () => (mathType ? exitFormula() : insertFormula());

    const setLink = () => {
        const previous = editor.getAttributes('link').href;
        const url = window.prompt('Link URL', previous || 'https://');

        if (url === null) {
            return; // cancelled
        }
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    // onMouseDown preventDefault keeps the editor selection while clicking a button.
    const Btn = ({ label, onClick, active, title }) => (
        <button
            type="button"
            title={title}
            className={`rte-btn${active ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
        >
            {label}
        </button>
    );

    return (
        <div className="rte">
            <div className="rte-toolbar">
                <Btn label="B" title="Bold" active={editor.isActive('bold')}
                    onClick={() => editor.chain().focus().toggleBold().run()} />
                <Btn label={<em>I</em>} title="Italic" active={editor.isActive('italic')}
                    onClick={() => editor.chain().focus().toggleItalic().run()} />
                <Btn label={<span style={{ textDecoration: 'underline' }}>U</span>} title="Underline"
                    active={editor.isActive('underline')}
                    onClick={() => editor.chain().focus().toggleUnderline().run()} />
                <Btn label="< >" title="Inline code" active={editor.isActive('code')}
                    onClick={() => editor.chain().focus().toggleCode().run()} />
                <Btn label="H" title="Heading" active={editor.isActive('heading', { level: 2 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
                <Btn label="• List" title="Bullet list" active={editor.isActive('bulletList')}
                    onClick={() => editor.chain().focus().toggleBulletList().run()} />
                <Btn label="1. List" title="Numbered list" active={editor.isActive('orderedList')}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()} />
                <Btn label="Code block" title="Code block" active={editor.isActive('codeBlock')}
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
                <Btn label="🔗" title="Link" active={editor.isActive('link')} onClick={setLink} />
                <Btn label="fx" active={!!mathType}
                    title={mathType ? 'Finish formula (back to text)' : 'Insert formula'}
                    onClick={onFxClick} />
                <span className="rte-toolbar__spacer" />
                <Btn label="↶" title="Undo" onClick={() => editor.chain().focus().undo().run()} />
                <Btn label="↷" title="Redo" onClick={() => editor.chain().focus().redo().run()} />
            </div>
            <EditorContent editor={editor} className="rte-content" />

            {mathType && (
                <div className="rte-mathhelp">
                    <div className="rte-mathhelp__intro">
                        Formula LaTeX ({mathType === 'blockMath' ? 'block' : 'inline'}) — edit here:
                    </div>
                    <textarea
                        className="rte-mathinput"
                        rows={2}
                        value={currentLatex}
                        placeholder="\frac{a}{b}"
                        autoFocus
                        onChange={(ev) => updateLatex(ev.target.value)}
                    />
                    <div className="rte-mathhelp__tip">
                        Tip: click <code>fx</code> to add another formula, or click any formula to edit its LaTeX here.
                    </div>
                    <div className="rte-mathhelp__grid">
                        <div className="rte-mathhelp__head">Type this</div>
                        <div className="rte-mathhelp__head">You get</div>
                        {MATH_EXAMPLES.map((ex, i) => (
                            <React.Fragment key={i}>
                                <code className="rte-mathhelp__tex">{ex.tex}</code>
                                <span className="rte-mathhelp__out"
                                    dangerouslySetInnerHTML={{ __html: renderTex(ex.tex) }} />
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RichTextEditor;
