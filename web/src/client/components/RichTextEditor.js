import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension, nodeInputRule, getMarkRange } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { MarkdownPaste } from './editor/markdownPaste';
import { TtsSkip } from './editor/ttsSkip';
import { TtsLang } from './editor/ttsLang';
import { TtsPause } from './editor/ttsPause';
import { MARKABLE_LANGUAGES, TTS_PAUSES, languageLabel, voiceLabel } from '../utils/tts';
import VoicePickerDialog from './VoicePickerDialog';

import { Indent } from './editor/indent';
import { FindReplace, findReplaceKey } from './editor/findReplace';
import shrinkImage from '../utils/shrinkImage';
import { FontSize } from './editor/fontSize';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Intuitive math typing shortcuts. The bundled extension's own rules are
// non-standard ($$=inline, $$$=block) and buggy, so we add cursor-anchored ones:
//   $…$   -> inline math      $$…$$ -> block math
// The regex captures the FULL delimited string as group 1 (so nodeInputRule
// replaces the delimiters too, not just the inner text) and the LaTeX as group 2.
// High priority so the block rule is tried before the built-in inline rule.
const MathInputRules = Extension.create({
    name: 'mathInputRules',
    priority: 1000,
    addInputRules() {
        const block = this.editor.schema.nodes.blockMath;
        const inline = this.editor.schema.nodes.inlineMath;
        const rules = [];
        if (block) {
            rules.push(nodeInputRule({
                find: /((?<!\$)\$\$([^$]+)\$\$)$/,
                type: block,
                getAttributes: (m) => ({ latex: m[2] }),
            }));
        }
        if (inline) {
            rules.push(nodeInputRule({
                find: /((?<!\$)\$([^$\n]+)\$)$/,
                type: inline,
                getAttributes: (m) => ({ latex: m[2] }),
            }));
        }
        return rules;
    },
});

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

// Rich-text editor for card bodies. Built on TipTap (ProseMirror).
//
// An editor only understands the kinds of content its *schema* lists; anything
// else is dropped when you paste. The extensions below build that schema:
//   StarterKit    bold, italic, underline, code, code block, headings, lists,
//                 link and undo/redo (TipTap v3 bundles these)
//   Mathematics   KaTeX-rendered LaTeX: type $…$ inline or $$…$$ for a block,
//                 or use the fx button
//   TableKit      tables (table, row, header cell, cell). Without it a pasted
//                 table lost its structure and became loose text
//   Markdown      a Markdown parser (editor.markdown) that MarkdownPaste uses;
//                 it changes nothing on its own
//   MarkdownPaste turns pasted Markdown into formatted content; see
//                 editor/markdownPaste.js and the "M↓" toggle below
//   FindReplace   find and replace in the note (🔍 or Cmd/Ctrl+F); see
//                 editor/findReplace.js and FindBar below
// Pale highlight colors — light enough that black text stays easy to read.
const HIGHLIGHTS = [
    { name: 'Yellow', color: '#FEF3C7' },
    { name: 'Green', color: '#DCFCE7' },
    { name: 'Blue', color: '#DBEAFE' },
    { name: 'Pink', color: '#FCE7F3' },
    { name: 'Purple', color: '#EDE9FE' },
    { name: 'Orange', color: '#FFEDD5' },
    { name: 'Cyan', color: '#CFFAFE' },
    { name: 'Gray', color: '#F1F5F9' },
];

// Font family and size choices for the desktop-only dropdowns.
// "Basic" are generic system stacks (no download); "Fonts" are self-hosted
// web fonts (see src/client/fonts.js) so they render the same on every device.
const FONTS = [
    { group: 'Basic', name: 'Default', value: '' },
    { group: 'Basic', name: 'Serif', value: 'Georgia, "Times New Roman", serif' },
    { group: 'Basic', name: 'Mono', value: 'ui-monospace, Menlo, Consolas, monospace' },
    { group: 'Fonts', name: 'Inter', value: "'Inter', sans-serif" },
    { group: 'Fonts', name: 'Lato', value: "'Lato', sans-serif" },
    { group: 'Fonts', name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { group: 'Fonts', name: 'Merriweather', value: "'Merriweather', serif" },
    { group: 'Fonts', name: 'Lora', value: "'Lora', serif" },
    { group: 'Fonts', name: 'Playfair Display', value: "'Playfair Display', serif" },
    { group: 'Fonts', name: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
    { group: 'Fonts', name: 'Caveat', value: "'Caveat', cursive" },
    { group: 'Fonts', name: 'Kalam', value: "'Kalam', cursive" },
    { group: 'Fonts', name: 'Indie Flower', value: "'Indie Flower', cursive" },
];
const FONT_GROUPS = ['Basic', 'Fonts'];
const SIZES = [11, 13, 15, 17, 19, 22, 26, 32];

const RichTextEditor = ({ value, onChange }) => {
    // Toggles the formula help/examples reference without inserting anything.
    const [showHelp, setShowHelp] = React.useState(false);
    // "M↓" toggle: while on, plain-text pastes are parsed as Markdown.
    const [markdownPaste, setMarkdownPaste] = React.useState(false);
    // Highlight color palette popover.
    const [showHl, setShowHl] = React.useState(false);
    // "Read in <language>" menu (next to 🔇) and its voice picker.
    const [showLang, setShowLang] = React.useState(false);
    const [voicePick, setVoicePick] = React.useState(false);
    // ⏸ menu: insert a read-aloud pause, or change/remove the selected one.
    const [showPause, setShowPause] = React.useState(false);
    // Kept current so the paste/drop handlers (defined at editor-config time) can
    // reach the editor instance, which only exists after useEditor returns.
    const editorRef = React.useRef(null);
    const fileInputRef = React.useRef(null);
    // Find and replace bar (🔍 / Cmd+F): { seed: the selected words it opens
    // with, n: bumped on every open so the bar refocuses }.
    const [find, setFind] = React.useState(null); // null = closed, else { seed, n }

    // Upload an image file to the backend (S3) and return its URL. Notes store
    // only this URL, never the image bytes (DynamoDB items cap at 400 KB).
    // Large photos are shrunk on the device first (shrinkImage), and the
    // upload gives up after two minutes rather than hanging on a dead
    // connection.
    const uploadImage = async (original) => {
        const file = await shrinkImage(original);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        try {
            const res = await fetch('/api/images', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(await res.text().catch(() => 'Upload failed'));
            return (await res.json()).url;
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('The upload took too long. Check your connection and try again.');
            if (err instanceof TypeError) throw new Error("Couldn't reach the server. Check your connection and try again.");
            throw err;
        } finally {
            clearTimeout(timer);
        }
    };

    const insertImageFile = async (file) => {
        const ed = editorRef.current;
        if (!ed || !file || !file.type.startsWith('image/')) return;
        try {
            const url = await uploadImage(file);
            ed.chain().focus().setImage({ src: url }).run();
        } catch (e) {
            window.alert('Could not upload image. ' + (e.message || ''));
        }
    };

    const imageFilesFrom = (list) => Array.from(list || []).filter((f) => f.type.startsWith('image/'));

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // No spell-check squiggles under code (commands, paths, names).
                code: { HTMLAttributes: { spellcheck: 'false' } },
                codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
                link: {
                    openOnClick: false,
                    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
                },
            }),
            Mathematics.configure({
                inlineOptions: { katexOptions: { throwOnError: false } },
                blockOptions: { katexOptions: { throwOnError: false } },
            }),
            MathInputRules,
            // Column resizing is off: widths set by dragging would be saved into
            // the note and fight the reader's screen width on phones.
            TableKit.configure({ table: { resizable: false } }),
            Markdown,
            MarkdownPaste,
            TtsSkip,
            TtsLang,
            TtsPause,
            // TextStyle must come before FontFamily/FontSize (they add attributes
            // to its mark). Highlight is multicolor so it can store a chosen color.
            TextStyle,
            FontFamily,
            FontSize,
            Highlight.configure({ multicolor: true }),
            Indent,
            // Images are uploaded to S3; the note stores only the URL (no base64).
            Image.configure({ inline: false, allowBase64: false }),
            FindReplace,
        ],
        // Saved notes are HTML. Say so explicitly, since with the Markdown
        // extension loaded a string could otherwise be read as Markdown.
        content: value || '',
        contentType: 'html',
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        // Pasting or dropping an image file uploads it and inserts the URL.
        editorProps: {
            // Clicking a pause chip selects it and opens the ⏸ menu to
            // change or remove it.
            handleClickOn: (view, pos, node) => {
                if (node.type.name === 'ttsPause') setShowPause(true);
                return false;
            },
            handlePaste: (view, event) => {
                const cd = event.clipboardData;
                let files = imageFilesFrom(cd && cd.files);
                // Many sources (screenshots, "Copy image") expose the image only
                // via items, not files — fall back to items.getAsFile(). Without
                // this the editor's default paste inserts the clipboard's own
                // <img> (a blob:/temporary src) instead, which shows as broken.
                if (!files.length && cd && cd.items) {
                    files = Array.from(cd.items)
                        .filter((it) => it.kind === 'file' && it.type && it.type.startsWith('image/'))
                        .map((it) => it.getAsFile())
                        .filter(Boolean);
                }
                if (files.length) { event.preventDefault(); files.forEach(insertImageFile); return true; }
                return false;
            },
            handleDrop: (view, event) => {
                const files = imageFilesFrom(event.dataTransfer && event.dataTransfer.files);
                if (files.length) { event.preventDefault(); files.forEach(insertImageFile); return true; }
                return false;
            },
        },
    });

    editorRef.current = editor;

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

    // Cmd/Ctrl+F in the note opens the bar, with the selected words in it.
    const openFind = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const { from, to, empty } = ed.state.selection;
        const picked = empty ? '' : ed.state.doc.textBetween(from, to, '\n');
        const seed = picked && picked.length <= 100 && !picked.includes('\n') ? picked : null;
        setFind((f) => ({ seed, n: (f ? f.n : 0) + 1 }));
    };
    if (editor) editor.storage.findReplace.onOpen = openFind;

    if (!editor) {
        return null;
    }

    // "Formula editor mode": a math node is selected.
    const mathType = editor.isActive('blockMath')
        ? 'blockMath'
        : (editor.isActive('inlineMath') ? 'inlineMath' : null);
    const currentLatex = mathType ? (editor.getAttributes(mathType).latex || '') : '';

    const updateLatex = (latex) => {
        // The math node is currently node-selected; note its position, update its
        // LaTeX, then re-select it. updateInlineMath (and update*) drop the node
        // selection, which would flip mathType to null and close this editor box.
        const pos = editor.state.selection.from;
        if (mathType === 'blockMath') editor.commands.updateBlockMath({ latex });
        else if (mathType === 'inlineMath') editor.commands.updateInlineMath({ latex });
        editor.commands.setNodeSelection(pos);
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

    const toggleMarkdownPaste = () => {
        const next = !markdownPaste;
        editor.storage.markdownPaste.enabled = next;
        setMarkdownPaste(next);
        editor.commands.focus();
    };

    // Indent/outdent: in a list, items nest/un-nest or the whole list moves
    // (never out of the list; see editor/indent.js); other blocks use the
    // Indent extension's margin levels.
    // Text to preview a voice with: the selection, or with just a cursor, the
    // whole marked phrase it's in ('' when there's neither).
    const selectedText = () => {
        const { from, to, empty, $from } = editor.state.selection;
        if (!empty) return editor.state.doc.textBetween(from, to, ' ');
        const range = getMarkRange($from, editor.schema.marks.ttsLang);
        return range ? editor.state.doc.textBetween(range.from, range.to, ' ') : '';
    };

    const indentMore = () => {
        if (editor.isActive('listItem')) editor.chain().focus().listAwareIndent().run();
        else editor.chain().focus().indentMore().run();
    };
    const indentLess = () => {
        if (editor.isActive('listItem')) editor.chain().focus().listAwareOutdent().run();
        else editor.chain().focus().indentLess().run();
    };

    // Closing clears the tints and puts the cursor on the current match.
    const closeFind = () => { setFind(null); editor.chain().focus().closeFind().run(); };

    const applyHighlight = (color) => { editor.chain().focus().setHighlight({ color }).run(); setShowHl(false); };
    const clearHighlight = () => { editor.chain().focus().unsetHighlight().run(); setShowHl(false); };

    // Current font/size, so the dropdowns reflect the selection.
    const ts = editor.getAttributes('textStyle') || {};
    const curFont = ts.fontFamily || '';
    const curSize = ts.fontSize ? String(ts.fontSize).replace('px', '') : '';
    const applyFont = (v) => (v
        ? editor.chain().focus().setFontFamily(v).run()
        : editor.chain().focus().unsetFontFamily().run());
    const applySize = (v) => (v
        ? editor.chain().focus().setFontSize(`${v}px`).run()
        : editor.chain().focus().unsetFontSize().run());

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
                <Btn label="🔇" title="Don't read aloud (mute for text-to-speech)" active={editor.isActive('ttsSkip')}
                    onClick={() => editor.chain().focus().toggleTtsSkip().run()} />
                {/* How the selection is read aloud: Automatic (English, or Hebrew
                    by its letters), a marked language, or a chosen voice
                    (editor/ttsLang.js, VoicePickerDialog). */}
                <span className="rte-hl">
                    {(() => {
                        const { lang: current, voice, speed } = editor.getAttributes('ttsLang');
                        const label = [
                            current ? languageLabel(current) : null,
                            voice ? voiceLabel(voice) : null,
                            speed ? `${speed}×` : null,
                        ].filter(Boolean).join(' · ');
                        return (
                            <button type="button" className={`rte-btn${label ? ' active' : ''}`}
                                title={label ? `Read aloud as ${label}` : 'Read aloud in another language, voice or speed'}
                                aria-haspopup="true" aria-expanded={showLang}
                                onMouseDown={(e) => e.preventDefault()} onClick={() => setShowLang((v) => !v)}>
                                🗣{label ? ` ${label}` : ''}<span className="rte-hl__caret">▾</span>
                            </button>
                        );
                    })()}
                    {showLang && (
                        <>
                            <div className="rte-hl__backdrop" onMouseDown={() => setShowLang(false)} />
                            <div className="rte-hl__pop rte-lang__pop" role="menu">
                                {[{ code: null, label: 'Automatic' }, ...MARKABLE_LANGUAGES].map((l) => {
                                    const on = (editor.getAttributes('ttsLang').lang || null) === l.code;
                                    return (
                                        <button type="button" key={l.code || 'auto'} role="menuitemradio" aria-checked={on}
                                            className={`rte-lang__item${on ? ' on' : ''}`}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => { editor.chain().focus().setTtsLang(l.code).run(); setShowLang(false); }}>
                                            <span className={`rte-lang__dot${l.code ? ` rte-lang__dot--${l.code}` : ''}`} aria-hidden="true" />
                                            {l.label}
                                            {!l.code && <span className="rte-lang__hint">English / Hebrew</span>}
                                            {on && <span className="rte-lang__check" aria-hidden="true">✓</span>}
                                        </button>
                                    );
                                })}
                                <div className="rte-lang__sep" role="separator" />
                                <button type="button" role="menuitem" className="rte-lang__item"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => { setShowLang(false); setVoicePick(true); }}>
                                    <i className="user circle outline icon rte-lang__icon" aria-hidden="true"></i>
                                    Voice and speed…
                                    {(() => {
                                        const { voice, speed } = editor.getAttributes('ttsLang');
                                        const hint = [voice ? voiceLabel(voice) : null, speed ? `${speed}×` : null].filter(Boolean).join(' · ');
                                        return hint ? <span className="rte-lang__hint">{hint}</span> : null;
                                    })()}
                                </button>
                            </div>
                        </>
                    )}
                    <VoicePickerDialog
                        open={voicePick}
                        initialLang={editor.getAttributes('ttsLang').lang || null}
                        initialVoice={editor.getAttributes('ttsLang').voice || null}
                        initialSpeed={editor.getAttributes('ttsLang').speed || null}
                        sampleText={selectedText()}
                        onClose={() => setVoicePick(false)}
                        onApply={(reading) => {
                            editor.chain().focus().setTtsReading(reading).run();
                            setVoicePick(false);
                        }} />
                </span>
                {/* ⏸: a read-aloud pause at the cursor (editor/ttsPause.js);
                    with a pause selected, change its length or remove it. */}
                <span className="rte-hl">
                    {(() => {
                        const selected = editor.isActive('ttsPause');
                        const current = selected ? editor.getAttributes('ttsPause').seconds : null;
                        return (
                            <>
                                <button type="button" className={`rte-btn${selected ? ' active' : ''}`}
                                    title={selected ? `Read-aloud pause: ${current} s` : 'Insert a read-aloud pause'}
                                    aria-haspopup="true" aria-expanded={showPause}
                                    onMouseDown={(e) => e.preventDefault()} onClick={() => setShowPause((v) => !v)}>
                                    ⏸{selected ? ` ${current}s` : ''}<span className="rte-hl__caret">▾</span>
                                </button>
                                {showPause && (
                                    <>
                                        <div className="rte-hl__backdrop" onMouseDown={() => setShowPause(false)} />
                                        <div className="rte-hl__pop rte-pause__pop" role="menu">
                                            <div className="rte-pause__label">
                                                {selected ? 'Change pause' : 'Pause reading for'}
                                            </div>
                                            <div className="rte-pause__choices">
                                                {TTS_PAUSES.map((sec) => (
                                                    <button type="button" key={sec} role="menuitemradio"
                                                        aria-checked={current === sec}
                                                        className={`rte-pause__choice${current === sec ? ' on' : ''}`}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            if (selected) editor.chain().focus().setTtsPauseSeconds(sec).run();
                                                            else editor.chain().focus().insertTtsPause(sec).run();
                                                            setShowPause(false);
                                                        }}>
                                                        {sec}s
                                                    </button>
                                                ))}
                                            </div>
                                            {selected && (
                                                <button type="button" role="menuitem" className="rte-pause__remove"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => { editor.chain().focus().deleteSelection().run(); setShowPause(false); }}>
                                                    Remove pause
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </>
                        );
                    })()}
                </span>
                <span className="rte-hl">
                    <button type="button" className={`rte-btn${editor.isActive('highlight') ? ' active' : ''}`}
                        title="Highlight" aria-haspopup="true" aria-expanded={showHl}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => setShowHl((v) => !v)}>
                        <span className="rte-hl__swatch">A</span>
                        <span className="rte-hl__caret">▾</span>
                    </button>
                    {showHl && (
                        <>
                            <div className="rte-hl__backdrop" onMouseDown={() => setShowHl(false)} />
                            <div className="rte-hl__pop" role="menu">
                                {HIGHLIGHTS.map((h) => (
                                    <button type="button" key={h.color} className="rte-hl__color"
                                        title={h.name} style={{ background: h.color }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => applyHighlight(h.color)} />
                                ))}
                                <button type="button" className="rte-hl__clear"
                                    onMouseDown={(e) => e.preventDefault()} onClick={clearHighlight}>Clear</button>
                            </div>
                        </>
                    )}
                </span>
                <Btn label="H" title="Heading" active={editor.isActive('heading', { level: 2 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
                <Btn label="• List" title="Bullet list" active={editor.isActive('bulletList')}
                    onClick={() => editor.chain().focus().toggleBulletList().run()} />
                <Btn label="1. List" title="Numbered list" active={editor.isActive('orderedList')}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()} />
                <Btn label="⇤" title="Decrease indent (move left)" onClick={indentLess} />
                <Btn label="⇥" title="Increase indent (move right)" onClick={indentMore} />
                <Btn label="Code block" title="Code block" active={editor.isActive('codeBlock')}
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
                <Btn label="🔗" title="Link" active={editor.isActive('link')} onClick={setLink} />
                <Btn label="🖼" title="Insert image (or paste / drag one in)"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()} />
                <Btn label="fx" active={!!mathType}
                    title={mathType ? 'Finish formula (back to text)' : 'Insert formula'}
                    onClick={onFxClick} />
                <Btn label="?" active={showHelp} title="Formula examples"
                    onClick={() => setShowHelp((v) => !v)} />
                {/* The toggle's state lives in React (to redraw the button)
                    and in the extension's storage (read at paste time). */}
                <Btn label="M↓" active={markdownPaste}
                    title={markdownPaste ? 'Paste as Markdown: on' : 'Paste as Markdown: off'}
                    onClick={toggleMarkdownPaste} />
                <Btn label="Select all" title="Select all text"
                    onClick={() => editor.chain().focus().selectAll().run()} />
                <Btn label="🔍" title="Find and replace (Ctrl+F / ⌘F)" active={!!find}
                    onClick={() => (find ? closeFind() : openFind())} />
                <select className="rte-select rte-desktop-only" title="Font" value={curFont}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => applyFont(e.target.value)}>
                    {FONT_GROUPS.map((g) => (
                        <optgroup key={g} label={g}>
                            {FONTS.filter((f) => f.group === g).map((f) => (
                                <option key={f.name} value={f.value}>{f.name}</option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <select className="rte-select rte-desktop-only" title="Font size" value={curSize}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => applySize(e.target.value)}>
                    <option value="">Size</option>
                    {SIZES.map((s) => <option key={s} value={String(s)}>{s}</option>)}
                </select>
                <span className="rte-toolbar__spacer" />
                <Btn label="↶" title="Undo" onClick={() => editor.chain().focus().undo().run()} />
                <Btn label="↷" title="Redo" onClick={() => editor.chain().focus().redo().run()} />
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) insertImageFile(f); e.target.value = ''; }} />
            {find && <FindBar editor={editor} open={find} onClose={closeFind} />}
            <EditorContent editor={editor} className="rte-content" />

            {(mathType || showHelp) && (
                <div className="rte-mathhelp">
                    {mathType && (
                        <>
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
                        </>
                    )}
                    <div className="rte-mathhelp__tip">
                        In the text you can also type <code>$…$</code> for inline math or <code>$$…$$</code> for a block —
                        e.g. <code>{'$$\\frac{a}{b}$$'}</code>. Or click <code>fx</code>, or click any formula to edit it here.
                    </div>
                    <div className="rte-mathhelp__grid">
                        <div className="rte-mathhelp__head">Type this LaTeX</div>
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

// The find and replace bar, between the toolbar and the text:
//   Find    [……]  3 of 12  ↑ ↓  [Aa]  ✕
//   Replace [……]  [Replace] [Replace all]
// Enter finds the next match (Shift+Enter the previous), Enter in Replace
// replaces, Esc closes. [Aa] = match capitals and accents exactly.
function FindBar({ editor, open, onClose }) {
    const [query, setQuery] = React.useState(open.seed || '');
    const [replacement, setReplacement] = React.useState('');
    const [exact, setExact] = React.useState(false);
    const findRef = React.useRef(null);
    const { matches, current } = findReplaceKey.getState(editor.state);

    // Opened again (🔍, Cmd+F): take the new selection and focus the box.
    React.useEffect(() => {
        if (open.seed) setQuery(open.seed);
        const el = findRef.current;
        if (el) { el.focus(); el.select(); }
    }, [open.n]);

    React.useEffect(() => { editor.commands.setFindQuery(query, exact); }, [editor, query, exact]);

    // Keep the current match in view.
    React.useEffect(() => {
        const el = editor.view.dom.querySelector('.rte-find--current');
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [editor, current, matches.length, query]);

    const keys = (e, onEnter) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        else if (e.key === 'Enter') { e.preventDefault(); onEnter(e); }
        else if (e.key === 'f' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); findRef.current.select(); }
    };
    const status = !query ? '' : matches.length ? `${current + 1} of ${matches.length}` : 'No matches';
    const none = matches.length === 0;
    // onMouseDown preventDefault keeps focus in the box while clicking arrows.
    const keep = (e) => e.preventDefault();

    return (
        <div className="rte-find-bar" role="search" aria-label="Find and replace in this note">
            <div className="rte-find-bar__row">
                <input ref={findRef} type="text" className="rte-find-bar__input" placeholder="Find"
                    aria-label="Find" value={query} onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => keys(e, (ev) => (ev.shiftKey ? editor.commands.findPrevious() : editor.commands.findNext()))} />
                <span className={`rte-find-bar__count${query && none ? ' is-none' : ''}`} aria-live="polite">{status}</span>
                <button type="button" className="rte-find-bar__btn" title="Previous (Shift+Enter)" aria-label="Previous match"
                    disabled={none} onMouseDown={keep} onClick={() => editor.commands.findPrevious()}>↑</button>
                <button type="button" className="rte-find-bar__btn" title="Next (Enter)" aria-label="Next match"
                    disabled={none} onMouseDown={keep} onClick={() => editor.commands.findNext()}>↓</button>
                <button type="button" aria-pressed={exact}
                    className={`rte-find-bar__btn rte-find-bar__exact${exact ? ' on' : ''}`}
                    title={exact ? 'Matching capitals and accents exactly' : 'Ignoring capitals and accents (click to match exactly)'}
                    onMouseDown={keep} onClick={() => setExact((v) => !v)}>Aa</button>
                <button type="button" className="rte-find-bar__btn rte-find-bar__close" title="Close (Esc)"
                    aria-label="Close find and replace" onMouseDown={keep} onClick={onClose}>✕</button>
            </div>
            <div className="rte-find-bar__row">
                <input type="text" className="rte-find-bar__input" placeholder="Replace with"
                    aria-label="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)}
                    onKeyDown={(e) => keys(e, () => editor.commands.replaceMatch(replacement))} />
                <button type="button" className="rte-find-bar__btn rte-find-bar__wide" disabled={none}
                    onMouseDown={keep} onClick={() => editor.commands.replaceMatch(replacement)}>Replace</button>
                <button type="button" className="rte-find-bar__btn rte-find-bar__wide" disabled={none}
                    onMouseDown={keep} onClick={() => editor.commands.replaceAllMatches(replacement)}>Replace all</button>
            </div>
        </div>
    );
}

export default RichTextEditor;
