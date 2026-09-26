import React, { useState } from 'react';
import { connect } from 'react-redux';
import { closeCardEditor, createCard, updateCard, deleteCard } from '../actions';
import RichTextEditor from './RichTextEditor';
import AddToCardbook from './AddToCardbook';

// In-place card editor. Rendered inside the detail pane (no modal/overlay) so
// creating and editing a card happens right where the card is read. Layout:
//   [ title input on its own row ]
//   [ delete · bookmark · cancel · save ]   (icon cluster, left-aligned)
//   [ formatting toolbar + body ]           (RichTextEditor)
function CardEditorInline({ cardEditor, onCreated, closeCardEditor, createCard, updateCard, deleteCard }) {
    const isEdit = cardEditor.mode === 'edit';
    const card = cardEditor.card;

    const [title, setTitle] = useState(isEdit && card ? card.title : '');
    const [content, setContent] = useState(isEdit && card ? card.content : '');
    const [showWbPopup, setShowWbPopup] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // A new card is always added to the cardbook being viewed. `extras` holds any
    // ADDITIONAL cardbooks staged via the picker (create mode only — in edit mode
    // the card exists and the picker toggles its memberships live).
    const currentWordbook = cardEditor.wordbook || '';
    const [extras, setExtras] = useState([]);

    const toggleExtra = (name) => {
        setExtras((prev) =>
            prev.includes(name) ? prev.filter((w) => w !== name) : [...prev, name]
        );
    };

    const onSave = async () => {
        if (title.trim() === '') return;
        if (isEdit) {
            updateCard(card.card_id, title, content);
        } else {
            const targets = [];
            if (currentWordbook) targets.push(currentWordbook);
            extras.forEach((w) => { if (!targets.includes(w)) targets.push(w); });
            const created = await createCard(title, content, targets);
            if (created && onCreated) onCreated(created);
        }
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
                    onClick={() => closeCardEditor()}>
                    <i className="times icon"></i>
                </button>
                <button className="card-tool card-tool--save" title="Save"
                    aria-label="Save" onClick={onSave} disabled={title.trim() === ''}>
                    <i className="check icon"></i>
                </button>
            </div>

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

            <RichTextEditor value={content} onChange={setContent} />
        </div>
    );
}

function mapStateToProps({ cardEditor }) {
    return { cardEditor };
}

export default connect(mapStateToProps, { closeCardEditor, createCard, updateCard, deleteCard })(CardEditorInline);
