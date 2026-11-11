import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchWordbooks, fetchWordbookUpdated, fetchNotebookItemsFor, addClassroomItem } from '../actions';

// The teacher's Add on a classroom page (computer only): send copies.
//   1. Pick one of your notebooks or wordbooks.
//   2. Send it whole ("Send the whole wordbook"), or tick notes and words in
//      it and "Send N".
// Each becomes a frozen copy in the classroom (api/classrooms.js addItem):
// changing your original later doesn't change it.
export default function ClassroomAddDialog({ classroomId, onClose, onSent }) {
    const dispatch = useDispatch();
    const names = useSelector((state) => state.wordbooks);
    const kinds = useSelector((state) => state.wordbookKinds) || {};
    const [book, setBook] = useState(null);   // the chosen notebook's name
    const [items, setItems] = useState(null); // its items: [{ type, id, title }]
    const [picked, setPicked] = useState({}); // "type:id" -> true
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => { dispatch(fetchWordbooks()); dispatch(fetchWordbookUpdated()); }, [dispatch]);

    const open = async (name) => {
        setBook(name);
        setItems(null);
        setPicked({});
        setError('');
        try {
            const list = await dispatch(fetchNotebookItemsFor(name));
            setItems(Array.isArray(list) ? list : []);
        } catch (err) {
            setError(err.message);
            setItems([]);
        }
    };

    // Send items one after another; stop at the first problem.
    const send = async (toSend) => {
        setSending(true);
        setError('');
        let done = 0;
        try {
            for (const item of toSend) {
                await dispatch(addClassroomItem(classroomId, item));
                done += 1;
            }
            onSent(done);
            onClose();
        } catch (err) {
            setError(done ? `Sent ${done}, then: ${err.message}` : err.message);
            if (done) onSent(done);
        }
        setSending(false);
    };

    const kindWord = (name) => (kinds[name] === 'wordbook' ? 'wordbook' : 'notebook');
    const sorted = Array.isArray(names) ? [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })) : null;
    const key = (it) => `${it.type}:${it.id}`;
    const chosen = (items || []).filter((it) => picked[key(it)]);

    return (
        <div className="cb-dialog__overlay" onMouseDown={() => !sending && onClose()}>
            <div className="cb-dialog class-add" role="dialog" aria-modal="true" aria-labelledby="class-add-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <h3 className="cb-dialog__title" id="class-add-title">
                    {book ? (
                        <button type="button" className="class-add__back" onClick={() => setBook(null)} aria-label="Back to the list">‹</button>
                    ) : null}
                    {book || 'Add to the classroom'}
                </h3>

                {!book && (
                    <>
                        <p className="cb-dialog__msg">Choose a notebook or wordbook. Students get copies: changing yours later doesn’t change theirs.</p>
                        {!sorted ? <p className="classrooms-page__muted">Loading…</p> : sorted.length === 0 ? (
                            <p className="classrooms-page__muted">You don’t have any notebooks yet.</p>
                        ) : (
                            <ul className="class-add__books">
                                {sorted.map((name) => (
                                    <li key={name}>
                                        <button type="button" onClick={() => open(name)}>
                                            <i className={`${kindWord(name) === 'wordbook' ? 'book' : 'clone outline'} icon`} aria-hidden="true"></i>
                                            <span>{name}</span>
                                            <span className="classrooms-page__muted">{kindWord(name)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}

                {book && (
                    <>
                        <button type="button" className="cb-btn cb-btn--ghost class-add__whole" disabled={sending || !items || !items.length}
                            onClick={() => send([{ type: 'notebook', id: book }])}>
                            Send the whole {kindWord(book)}
                        </button>
                        <p className="cb-dialog__msg">Or choose notes and words from it:</p>
                        {!items ? <p className="classrooms-page__muted">Loading…</p> : items.length === 0 ? (
                            <p className="classrooms-page__muted">It’s empty.</p>
                        ) : (
                            <ul className="class-add__items">
                                {items.map((it) => (
                                    <li key={key(it)}>
                                        <label>
                                            <input type="checkbox" checked={!!picked[key(it)]}
                                                onChange={(e) => setPicked({ ...picked, [key(it)]: e.target.checked })} />
                                            <i className={`${it.type === 'card' ? 'sticky note outline' : 'font'} icon`} aria-hidden="true"></i>
                                            {it.title || it.id}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}

                {error && <p className="cb-sheet__error">{error}</p>}
                <div className="cb-dialog__actions">
                    <button type="button" className="cb-btn cb-btn--ghost" disabled={sending} onClick={onClose}>Cancel</button>
                    {book && (
                        <button type="button" className="cb-btn cb-btn--accent" disabled={sending || !chosen.length}
                            onClick={() => send(chosen.map((it) => ({ type: it.type, id: it.id })))}>
                            {sending ? 'Sending…' : `Send ${chosen.length || ''}`.trim()}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
