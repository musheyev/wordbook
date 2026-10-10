import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { closeCardEditor, createCard, updateCard, deleteCard, requestErrorMessage } from '../actions';
import RichTextEditor from './LazyRichTextEditor';
import AddToCardbook from './AddToCardbook';
import useDraft from '../utils/useDraft';
import { reportNoteAudio } from '../utils/ttsPlayer';
import { timeAgo } from '../utils/timeAgo';

// In-place card editor. Rendered inside the detail pane (no modal/overlay) so
// creating and editing a card happens right where the card is read. Layout:
//   [ title input on its own row ]
//   [ delete · bookmark · cancel · save ]   (icon cluster, left-aligned)
//   [ formatting toolbar + body ]           (RichTextEditor)
//
// Saving on a slow or dropped connection: Save shows that it's working and
// can't be pressed twice; if the save fails, the editor stays open with the
// text and a "Try again". Until the server confirms, the text is also kept
// on this device (useDraft), so a closed tab or crash doesn't lose it; the
// next time this note is edited, the editor offers to restore it.
function CardEditorInline({ cardEditor, onCreated, closeCardEditor, createCard, updateCard, deleteCard }) {
    // Phones: while editing, the note fills exactly the screen above the
    // keyboard and scrolls inside itself, instead of the whole page scrolling
    // (.cb-detail--editing in styles.css). The keyboard doesn't resize the
    // page on iPhones, so the visible area comes from window.visualViewport.
    useEffect(() => {
        const root = document.documentElement;
        const vv = window.visualViewport;
        const update = () => {
            if (!vv) return;
            root.style.setProperty('--vvh', `${vv.height}px`);
            root.style.setProperty('--vvtop', `${vv.offsetTop}px`);
        };
        root.classList.add('editing-note');
        update();
        if (vv) { vv.addEventListener('resize', update); vv.addEventListener('scroll', update); }
        return () => {
            root.classList.remove('editing-note');
            root.style.removeProperty('--vvh');
            root.style.removeProperty('--vvtop');
            if (vv) { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); }
        };
    }, []);

    const isEdit = cardEditor.mode === 'edit';
    const card = cardEditor.card;

    const savedTitle = isEdit && card ? card.title : '';
    const savedContent = isEdit && card ? card.content : '';
    const [title, setTitle] = useState(savedTitle);
    const [content, setContent] = useState(savedContent);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    // Bumped to remount the rich text editor with restored content.
    const [editorKey, setEditorKey] = useState(0);
    const [showWbPopup, setShowWbPopup] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // A new card is always added to the cardbook being viewed. `extras` holds any
    // ADDITIONAL cardbooks staged via the picker (create mode only — in edit mode
    // the card exists and the picker toggles its memberships live).
    const currentWordbook = cardEditor.wordbook || '';
    const [extras, setExtras] = useState([]);

    const draft = useDraft(isEdit && card ? `note:${card.card_id}` : `note:new:${currentWordbook}`,
        { title, content }, { title: savedTitle, content: savedContent });

    const restoreDraft = () => {
        const value = draft.takeRestorable();
        if (!value) return;
        setTitle(value.title || '');
        setContent(value.content || '');
        setEditorKey((k) => k + 1);
    };

    const toggleExtra = (name) => {
        setExtras((prev) =>
            prev.includes(name) ? prev.filter((w) => w !== name) : [...prev, name]
        );
    };

    const onSave = async () => {
        if (title.trim() === '' || saving) return;
        setSaving(true);
        setSaveError('');
        try {
            if (isEdit) {
                await updateCard(card.card_id, title, content);
                draft.clear();
                reportNoteAudio(`card:${card.card_id}`, content);
            } else {
                const targets = [];
                if (currentWordbook) targets.push(currentWordbook);
                extras.forEach((w) => { if (!targets.includes(w)) targets.push(w); });
                const created = await createCard(title, content, targets);
                draft.clear();
                if (created && created.card_id) reportNoteAudio(`card:${created.card_id}`, content);
                if (created && onCreated) onCreated(created);
            }
        } catch (err) {
            setSaveError(requestErrorMessage(err, "Couldn't save the note."));
            setSaving(false);
        }
    };

    const onCancel = () => {
        draft.clear();
        closeCardEditor();
    };

    return (
        <div className="card-editor">
            <input
                className="card-editor__title"
                type="text"
                placeholder="Note title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
            />

            <div className="card-editor__actions">
                {isEdit && (
                    <button className="card-tool card-tool--danger" title="Delete note"
                        aria-label="Delete note" onClick={() => setConfirmingDelete(true)}>
                        <i className="trash alternate outline icon"></i>
                    </button>
                )}
                <span className="a2c-anchor">
                    <button className="card-tool" title="Add to notebook" aria-label="Add to notebook"
                        onClick={() => setShowWbPopup((v) => !v)}>
                        <i className="bookmark outline icon"></i>
                    </button>
                    {showWbPopup && (
                        <AddToCardbook align="left"
                            staged={!isEdit}
                            selected={extras}
                            onToggle={toggleExtra}
                            lockedName={!isEdit ? currentWordbook : ''}
                            onClose={() => setShowWbPopup(false)} />
                    )}
                </span>
                <button className="card-tool" title="Cancel" aria-label="Cancel"
                    onClick={onCancel} disabled={saving}>
                    <i className="times icon"></i>
                </button>
                <button className="card-tool card-tool--save" title={saving ? 'Saving…' : 'Save'}
                    aria-label={saving ? 'Saving' : 'Save'} onClick={onSave} disabled={title.trim() === '' || saving}>
                    <i className={saving ? 'spinner loading icon' : 'check icon'}></i>
                </button>
                {saving && <span className="card-editor__status">Saving…</span>}
            </div>

            {saveError && (
                <div className="card-editor__error" role="alert">
                    <span>{saveError} Your text is kept on this device until it's saved.</span>
                    <button type="button" className="cb-btn" onClick={onSave}>Try again</button>
                </div>
            )}

            {draft.restorable && (
                <div className="card-editor__restore" role="status">
                    <span>You have unsaved changes to this note from {timeAgo(draft.restorable.at)}.</span>
                    <button type="button" className="cb-btn cb-btn--accent" onClick={restoreDraft}>Restore</button>
                    <button type="button" className="cb-btn" onClick={draft.discard}>Discard</button>
                </div>
            )}

            {confirmingDelete && isEdit && (
                <div className="card-confirm">
                    <span className="card-confirm__msg">
                        Delete "{card.title}" from every notebook? This can't be undone.
                    </span>
                    <span className="card-confirm__actions">
                        <button className="card-confirm__cancel"
                            onClick={() => setConfirmingDelete(false)}>Cancel</button>
                        <button className="card-confirm__delete"
                            onClick={() => deleteCard(card.card_id)}>Delete</button>
                    </span>
                </div>
            )}

            <RichTextEditor key={editorKey} value={content} onChange={setContent} />
        </div>
    );
}

function mapStateToProps({ cardEditor }) {
    return { cardEditor };
}

export default connect(mapStateToProps, { closeCardEditor, createCard, updateCard, deleteCard })(CardEditorInline);
