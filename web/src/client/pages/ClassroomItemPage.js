import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import ReadAloud from '../components/ReadAloud';
import { fetchClassroomItem, saveClassroomItem, fetchWordbooks, fetchWordData } from '../actions';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { htmlToChunks } from '../utils/tts';
import { site } from '../utils/site';
import { classroomPath, itemTypeLabel, itemTypeIcon } from '../utils/classroomPaths';
import { notebookPath } from '../utils/notebookPaths';

// One thing in a classroom (/classroom/:id/item/:item), read-only, on every
// device (api/classrooms.js readItem). Nobody can change it here; students
// keep their own copy with Save:
//   a note      its text, Play (read aloud), Save to one of your notebooks
//   a word      Look it up (the Words page), Save to one of your notebooks
//   a notebook  its words and notes (each note opens in place, with Play and
//               Save), and "Save a copy" as a new notebook — or wordbook — of yours

/** "Save to …" a notebook of yours: a picker and a button. */
function SaveToNotebook({ onSave, label = 'Save to my notebook' }) {
    const dispatch = useDispatch();
    const names = useSelector((state) => state.wordbooks);
    const [open, setOpen] = useState(false);
    const [target, setTarget] = useState('');
    const [state, setState] = useState({ busy: false, error: '', done: '' });

    useEffect(() => { if (open) dispatch(fetchWordbooks()); }, [open, dispatch]);

    if (!open) {
        return <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setOpen(true)}>{label}</button>;
    }
    const list = Array.isArray(names) ? [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })) : [];
    return (
        <span className="class-save">
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Notebook to save it in">
                <option value="">Choose a notebook…</option>
                {list.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="cb-btn cb-btn--accent" disabled={!target || state.busy}
                onClick={async () => {
                    setState({ busy: true, error: '', done: '' });
                    try {
                        await onSave(target);
                        setState({ busy: false, error: '', done: target });
                    } catch (err) {
                        setState({ busy: false, error: err.message, done: '' });
                    }
                }}>
                {state.busy ? 'Saving…' : 'Save'}
            </button>
            {state.done && <span className="class-save__done">Saved to <Link to={notebookPath(state.done)}>{state.done}</Link>.</span>}
            {state.error && <span className="cb-sheet__error">{state.error}</span>}
        </span>
    );
}

/** A note's text, read-only, with formulas drawn. */
function NoteText({ html }) {
    const ref = useRef(null);
    useEffect(() => { renderMathIn(ref.current); });
    return <div ref={ref} className="card-content class-note" dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(html || '') }} />;
}

function ClassroomItemPage() {
    const { id, item: itemId } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [item, setItem] = useState(null);
    const [error, setError] = useState('');
    const [openNote, setOpenNote] = useState(null);   // index of the open note in a notebook
    const [copyName, setCopyName] = useState(null);   // "Save a copy" name being typed
    const [copy, setCopy] = useState({ busy: false, error: '', done: '' });

    useEffect(() => {
        setItem(null);
        dispatch(fetchClassroomItem(id, itemId)).then(setItem, (err) => setError(err.message));
    }, [id, itemId, dispatch]);

    const back = <Link to={classroomPath(id)} className="classroom-page__back">‹ Back to the classroom</Link>;
    if (error) return <div className="cb-account classroom-page">{back}<div className="cb-empty">{error}</div></div>;
    if (!item) return <div className="cb-account classroom-page">{back}<p className="classrooms-page__muted">Loading…</p></div>;

    const lookUp = (word) => { dispatch(fetchWordData(word)); navigate(site.wordsPath); };
    const play = (title, html) => <ReadAloud getChunks={() => htmlToChunks(html || '')} title={title} />;

    return (
        <div className="cb-account classroom-page class-item-page">
            {back}
            <span className="class-item__type">
                <i className={`${itemTypeIcon(item)} icon`} aria-hidden="true"></i>{itemTypeLabel(item)}
            </span>
            <h1 className="cb-page-title">{item.title}</h1>

            {item.type === 'card' && (
                <>
                    <div className="class-item-page__tools">
                        {play(item.title, item.content)}
                        <SaveToNotebook onSave={(wordbook) => dispatch(saveClassroomItem(id, itemId, { wordbook }))} />
                    </div>
                    <NoteText html={item.content} />
                </>
            )}

            {item.type === 'word' && (
                <div className="class-item-page__tools">
                    <button type="button" className="cb-btn cb-btn--accent" onClick={() => lookUp(item.title)}>
                        <i className="search icon" aria-hidden="true"></i>Look it up
                    </button>
                    <SaveToNotebook onSave={(wordbook) => dispatch(saveClassroomItem(id, itemId, { wordbook }))} />
                </div>
            )}

            {item.type === 'notebook' && (
                <>
                    <div className="class-item-page__tools">
                        {copyName === null ? (
                            <button type="button" className="cb-btn cb-btn--accent" onClick={() => { setCopy({ busy: false, error: '', done: '' }); setCopyName(item.title); }}>
                                Save a copy as my {item.kind === 'wordbook' ? 'wordbook' : 'notebook'}
                            </button>
                        ) : (
                            <span className="class-save">
                                <input type="text" value={copyName} aria-label="Name for your copy" maxLength={100}
                                    onChange={(e) => setCopyName(e.target.value)} />
                                <button type="button" className="cb-btn cb-btn--accent" disabled={copy.busy || !copyName.trim()}
                                    onClick={async () => {
                                        setCopy({ busy: true, error: '', done: '' });
                                        try {
                                            const out = await dispatch(saveClassroomItem(id, itemId, { name: copyName.trim() }));
                                            setCopy({ busy: false, error: '', done: out.name });
                                            setCopyName(null);
                                        } catch (err) {
                                            setCopy({ busy: false, error: err.message, done: '' });
                                        }
                                    }}>{copy.busy ? 'Saving…' : 'Save'}</button>
                                <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setCopyName(null)}>Cancel</button>
                            </span>
                        )}
                        {copy.done && <span className="class-save__done">Saved as <Link to={notebookPath(copy.done)}>{copy.done}</Link>.</span>}
                        {copy.error && <span className="cb-sheet__error">{copy.error}</span>}
                    </div>

                    {item.notes.length > 0 && (
                        <section className="classrooms-page__section">
                            <h2 className="classrooms-page__heading">Notes ({item.notes.length})</h2>
                            <ul className="class-nb__notes">
                                {item.notes.map((n) => (
                                    <li key={n.index} className={openNote === n.index ? 'open' : ''}>
                                        <button type="button" className="class-nb__note-title" aria-expanded={openNote === n.index}
                                            onClick={() => setOpenNote(openNote === n.index ? null : n.index)}>
                                            <i className={`${openNote === n.index ? 'angle down' : 'angle right'} icon`} aria-hidden="true"></i>
                                            {n.title}
                                        </button>
                                        {openNote === n.index && (
                                            <div className="class-nb__note">
                                                <div className="class-item-page__tools">
                                                    {play(n.title, n.content)}
                                                    <SaveToNotebook label="Save this note"
                                                        onSave={(wordbook) => dispatch(saveClassroomItem(id, itemId, { note: n.index, wordbook }))} />
                                                </div>
                                                <NoteText html={n.content} />
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {item.words.length > 0 && (
                        <section className="classrooms-page__section">
                            <h2 className="classrooms-page__heading">Words ({item.words.length})</h2>
                            <div className="class-nb__words">
                                {item.words.map((w) => (
                                    <button key={w} type="button" className="class-nb__word" title="Look it up" onClick={() => lookUp(w)}>{w}</button>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

export default requireAuth(ClassroomItemPage);
