import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { lookupWord, addWordbookWord, openCardEditor } from '../actions';
import { itemPath } from '../utils/notebookPaths';

// First definition of a lookup result as plain text (definitions are HTML).
function firstDefinition(data) {
    const lists = data && data.definitions ? Object.values(data.definitions) : [];
    const first = lists.find((list) => Array.isArray(list) && list.length > 0);
    if (!first) return '';
    const doc = new DOMParser().parseFromString(String(first[0]), 'text/html');
    return (doc.body.textContent || '').trim();
}

// "Add to <notebook>": look a word up and add it without leaving the
// notebook, or switch to writing a note. Centered dialog on desktop, bottom
// sheet on phones.
function AddItemSheet({ open, wordbook, onClose, wordbookWords, lookupWord, addWordbookWord, openCardEditor }) {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | done | error
    const [result, setResult] = useState(null);   // { word, definition }
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (open) {
            setQuery('');
            setStatus('idle');
            setResult(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const inNotebook = (word) => (wordbookWords || []).some(
        (item) => item.type === 'word' && item.id.toLowerCase() === word.toLowerCase()
    );

    const onLookup = async (e) => {
        e.preventDefault();
        const word = query.trim();
        if (word === '') {
            inputRef.current && inputRef.current.focus();
            return;
        }
        setStatus('loading');
        try {
            const data = await lookupWord(word);
            setResult({ word, definition: firstDefinition(data) });
            setStatus('done');
        } catch (err) {
            setStatus('error');
        }
    };

    const onAdd = async () => {
        setAdding(true);
        await addWordbookWord(wordbook, result.word);
        setAdding(false);
    };

    const onOpen = (word) => {
        onClose();
        navigate(itemPath(wordbook, { type: 'word', id: word }));
    };

    const onWriteNote = () => {
        onClose();
        openCardEditor({ mode: 'create', wordbook });
    };

    const added = result && inNotebook(result.word);

    return (
        <div className="cb-sheet__overlay" onMouseDown={onClose}>
            <div className="cb-sheet" role="dialog" aria-modal="true" aria-label={`Add to ${wordbook}`}
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <div className="cb-sheet__head">
                    <h3 className="cb-sheet__title">Add to {wordbook}</h3>
                    <button type="button" className="a2c__close" aria-label="Close" onClick={onClose}>
                        <i className="times icon"></i>
                    </button>
                </div>

                <form className="cb-search cb-search--sheet" onSubmit={onLookup}>
                    <i className="search icon cb-search__icon" aria-hidden="true"></i>
                    <input ref={inputRef} type="text" className="cb-search__input" autoFocus
                        placeholder="Look up a word" autoComplete="off" autoCapitalize="none"
                        value={query} onChange={(e) => setQuery(e.target.value)} />
                    <button type="submit" className="cb-search__go" aria-label="Look up">
                        <i className="arrow right icon" aria-hidden="true"></i>
                    </button>
                </form>

                <div className="add-sheet__result" aria-live="polite">
                    {status === 'loading' && <div className="add-sheet__hint">Looking up…</div>}
                    {status === 'error' && (
                        <div className="cb-sheet__error">Couldn't look that up. Check your connection and try again.</div>
                    )}
                    {status === 'done' && result && (
                        <div className="add-sheet__row">
                            <div className="add-sheet__text">
                                <div className="add-sheet__word">{result.word}</div>
                                <div className="add-sheet__def">
                                    {result.definition || 'No definition found. You can still add it.'}
                                </div>
                            </div>
                            {added ? (
                                <button type="button" className="cb-btn cb-btn--ghost add-sheet__btn"
                                    onClick={() => onOpen(result.word)}>
                                    <i className="check icon"></i>Open
                                </button>
                            ) : (
                                <button type="button" className="cb-btn cb-btn--accent add-sheet__btn"
                                    disabled={adding} onClick={onAdd}>
                                    <i className="plus icon"></i>{adding ? 'Adding…' : 'Add'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <button type="button" className="add-sheet__note" onClick={onWriteNote}>
                    <i className="sticky note outline icon"></i>
                    Write a note instead
                </button>
            </div>
        </div>
    );
}

function mapStateToProps({ wordbookWords }) {
    return { wordbookWords };
}

export default connect(mapStateToProps, { lookupWord, addWordbookWord, openCardEditor })(AddItemSheet);
