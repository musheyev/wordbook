import React, { useState } from 'react';
import { connect } from 'react-redux';
import { closeCardEditor, createCard, updateCard, deleteCard } from '../actions';
import RichTextEditor from './RichTextEditor';

// Global modal for creating and editing cards. Mounted (keyed) only while open,
// so useState initializers pick up the right card each time it opens.
function CardEditorModal({ cardEditor, wordbooks, closeCardEditor, createCard, updateCard, deleteCard }) {
    const isEdit = cardEditor.mode === 'edit';
    const card = cardEditor.card;

    const [title, setTitle] = useState(isEdit && card ? card.title : '');
    const [content, setContent] = useState(isEdit && card ? card.content : '');
    // In create mode, preselect the wordbook currently being viewed.
    const [selected, setSelected] = useState(
        !isEdit && cardEditor.wordbook ? [cardEditor.wordbook] : []
    );

    const toggleWordbook = (name) => {
        setSelected((prev) =>
            prev.includes(name) ? prev.filter((w) => w !== name) : [...prev, name]
        );
    };

    const onSave = () => {
        if (isEdit) {
            updateCard(card.card_id, title, content);
        } else {
            createCard(title, content, selected);
        }
    };

    const onDelete = () => {
        if (window.confirm('Delete this card from every wordbook? This cannot be undone.')) {
            deleteCard(card.card_id);
        }
    };

    return (
        <div className="card-modal__overlay" onMouseDown={() => closeCardEditor()}>
            <div className="card-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="card-modal__header">
                    <h3>{isEdit ? 'Edit card' : 'New card'}</h3>
                    <button className="card-modal__close" title="Close"
                        onClick={() => closeCardEditor()}>×</button>
                </div>

                <label className="card-modal__label">Title</label>
                <input
                    className="card-modal__title"
                    type="text"
                    placeholder="Card title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                />

                <label className="card-modal__label">Content</label>
                <RichTextEditor value={content} onChange={setContent} />

                {!isEdit && (
                    <div className="card-modal__wordbooks">
                        <div className="card-modal__label">Add to wordbooks</div>
                        {(wordbooks || []).length === 0 ? (
                            <div className="card-modal__hint">You have no wordbooks yet.</div>
                        ) : (
                            wordbooks.map((name, i) => (
                                <label key={`cardwb${i}`} className="card-modal__wb">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(name)}
                                        onChange={() => toggleWordbook(name)}
                                    />
                                    <span> {name}</span>
                                </label>
                            ))
                        )}
                    </div>
                )}

                <div className="card-modal__actions">
                    {isEdit && (
                        <button className="card-modal__delete" onClick={onDelete}>Delete card</button>
                    )}
                    <span className="card-modal__spacer" />
                    <button className="card-modal__cancel" onClick={() => closeCardEditor()}>Cancel</button>
                    <button className="card-modal__save" onClick={onSave}
                        disabled={title.trim() === ''}>
                        {isEdit ? 'Save' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function mapStateToProps({ cardEditor, wordbooks }) {
    return { cardEditor, wordbooks };
}

export default connect(mapStateToProps, { closeCardEditor, createCard, updateCard, deleteCard })(CardEditorModal);
