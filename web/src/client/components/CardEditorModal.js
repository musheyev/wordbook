import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { closeCardEditor, createCard, updateCard, deleteCard, fetchWordbooks } from '../actions';
import RichTextEditor from './RichTextEditor';

// Global modal for creating and editing cards. Mounted (keyed) only while open,
// so useState initializers pick up the right card each time it opens.
function CardEditorModal({ cardEditor, wordbooks, closeCardEditor, createCard, updateCard, deleteCard, fetchWordbooks }) {
    const isEdit = cardEditor.mode === 'edit';
    const card = cardEditor.card;

    // Load the wordbook list when the modal opens. Otherwise it's empty when the
    // modal is opened from an empty wordbook (where SearchResult, which normally
    // fetches it, hasn't rendered). Track loading so we show a spinner instead of
    // a premature "no wordbooks yet".
    const [loadingWordbooks, setLoadingWordbooks] = useState(true);
    useEffect(() => {
        setLoadingWordbooks(true);
        Promise.resolve(fetchWordbooks()).finally(() => setLoadingWordbooks(false));
    }, [fetchWordbooks]);

    const [title, setTitle] = useState(isEdit && card ? card.title : '');
    const [content, setContent] = useState(isEdit && card ? card.content : '');

    // The card is always added to the wordbook currently being viewed. `extras`
    // holds any ADDITIONAL wordbooks the user picks via the popup.
    const currentWordbook = cardEditor.wordbook || '';
    const [extras, setExtras] = useState([]);
    const [showWbPopup, setShowWbPopup] = useState(false);

    // Other wordbooks the card isn't already implicitly in.
    const otherWordbooks = [...(wordbooks || [])]
        .filter((w) => w !== currentWordbook)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const toggleExtra = (name) => {
        setExtras((prev) =>
            prev.includes(name) ? prev.filter((w) => w !== name) : [...prev, name]
        );
    };

    const onSave = () => {
        if (isEdit) {
            updateCard(card.card_id, title, content);
        } else {
            // current wordbook (if any) + the chosen extras, de-duped
            const targets = [];
            if (currentWordbook) targets.push(currentWordbook);
            extras.forEach((w) => { if (!targets.includes(w)) targets.push(w); });
            createCard(title, content, targets);
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
                        <div className="card-modal__wb-more">
                            <button type="button" className="button-as-link card-modal__wb-link"
                                onClick={() => setShowWbPopup((v) => !v)}>
                                {currentWordbook ? 'Also add to other wordbooks' : 'Add to wordbooks'}
                                {extras.length > 0 ? ` · ${extras.length} selected` : ''}
                            </button>

                            {showWbPopup && (
                                <>
                                    <div className="card-modal__wb-popup-backdrop"
                                        onMouseDown={() => setShowWbPopup(false)} />
                                    <div className="card-modal__wb-popup"
                                        onMouseDown={(e) => e.stopPropagation()}>
                                        {loadingWordbooks && (wordbooks || []).length === 0 ? (
                                            <div className="card-modal__loading">
                                                <i className="fa fa-spinner fa-spin" aria-hidden="true"></i>
                                                <span>Loading wordbooks…</span>
                                            </div>
                                        ) : otherWordbooks.length === 0 ? (
                                            <div className="card-modal__hint">No other wordbooks.</div>
                                        ) : (
                                            <div className="card-modal__wb-list">
                                                {otherWordbooks.map((name, i) => (
                                                    <label key={`cardwb${i}`} className="card-modal__wb">
                                                        <input
                                                            type="checkbox"
                                                            checked={extras.includes(name)}
                                                            onChange={() => toggleExtra(name)}
                                                        />
                                                        <span> {name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        <div className="card-modal__wb-popup-actions">
                                            <button type="button" className="card-modal__wb-done"
                                                onClick={() => setShowWbPopup(false)}>Done</button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
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

export default connect(mapStateToProps, { closeCardEditor, createCard, updateCard, deleteCard, fetchWordbooks })(CardEditorModal);
