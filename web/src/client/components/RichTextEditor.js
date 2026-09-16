import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// Rich-text editor for card bodies. Built on TipTap (ProseMirror). StarterKit
// (v3) already bundles bold, italic, underline, code, code block, headings,
// lists, link and undo/redo, so we only configure the link behaviour here.
// Toolbar: B · I · U · inline-code · H · • list · 1. list · code-block · link · undo/redo.
const RichTextEditor = ({ value, onChange }) => {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                link: {
                    openOnClick: false,
                    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
                },
            }),
        ],
        content: value || '',
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    if (!editor) {
        return null;
    }

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
                <span className="rte-toolbar__spacer" />
                <Btn label="↶" title="Undo" onClick={() => editor.chain().focus().undo().run()} />
                <Btn label="↷" title="Redo" onClick={() => editor.chain().focus().redo().run()} />
            </div>
            <EditorContent editor={editor} className="rte-content" />
        </div>
    );
};

export default RichTextEditor;
