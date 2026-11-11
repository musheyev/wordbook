import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import ConfirmDialog from '../components/ConfirmDialog';
import ClassroomAddDialog from '../components/ClassroomAddDialog';
import {
    fetchClassroom, fetchMyClassrooms, updateClassroom, deleteClassroom, inviteToClassroom,
    removeClassroomMember, removeClassroomItem, leaveClassroom,
} from '../actions';
import { useIsComputer } from '../utils/computerOnly';
import { MY_CLASSROOMS_PATH, classroomItemPath, itemTypeLabel, itemTypeIcon } from '../utils/classroomPaths';

// One classroom (/classroom/:id; api/classrooms.js).
//
// Everyone in it: what the teacher sent (cards, newest first; each opens
// read-only, ClassroomItemPage) and who has joined (usernames only).
// Students: Leave.
// The teacher, on a computer (teacher tools aren't on phones):
//   Add      send copies of notes, words, notebooks or wordbooks (ClassroomAddDialog)
//   Invite   by username; the student joins from My Classrooms
//   ⋯        Rename, Close / Reopen, Delete
//   ×        on a card or a member: take it out
// On a phone the teacher sees the classroom as a student would.
/** "1 note", "3 notes", or nothing for 0. */
const count = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');

function ClassroomPage() {
    const { id } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isComputer = useIsComputer();
    const [room, setRoom] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    const [inviting, setInviting] = useState(null);   // the username being typed
    const [renaming, setRenaming] = useState(null);   // the new name being typed
    const [confirm, setConfirm] = useState(null);     // { title, message, label, run }
    const [busy, setBusy] = useState(false);

    const load = () => dispatch(fetchClassroom(id)).then((r) => { setRoom(r); setLoadError(''); }, (err) => setLoadError(err.message));
    useEffect(() => { setRoom(null); load(); }, [id]);

    const teacherTools = room && room.role === 'teacher' && isComputer;

    // Run a change, show what happened, reload the classroom (and My Classrooms).
    const act = async (run, done) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const out = await run();
            if (done) setNotice(typeof done === 'function' ? done(out) : done);
            await load();
            dispatch(fetchMyClassrooms());
            setBusy(false);
            return true;
        } catch (err) {
            setError(err.message);
            setBusy(false);
            return false;
        }
    };

    if (loadError) {
        return (
            <div className="cb-account classroom-page">
                <Link to={MY_CLASSROOMS_PATH} className="classroom-page__back">‹ My Classrooms</Link>
                <div className="cb-empty">{loadError}</div>
            </div>
        );
    }
    if (!room) return <div className="cb-account classroom-page"><p className="classrooms-page__muted">Loading…</p></div>;

    const closed = room.status !== 'open';
    const joinedCount = room.members.filter((m) => m.status === 'joined').length;

    return (
        <div className="cb-account classroom-page">
            <Link to={MY_CLASSROOMS_PATH} className="classroom-page__back">‹ My Classrooms</Link>
            <div className="cb-account__head classroom-page__head">
                <span>
                    <h1 className="cb-page-title">{room.title}</h1>
                    <span className="classrooms-page__muted">
                        {room.role === 'teacher' ? 'You teach this classroom' : `Teacher: ${room.teacherName}`}
                        {closed ? ' · Closed: students can’t see it' : ''}
                    </span>
                </span>
                {teacherTools && (
                    <span className="classroom-page__tools">
                        <button type="button" className="cb-btn cb-btn--accent" onClick={() => setAdding(true)}>
                            <i className="plus icon" aria-hidden="true"></i>Add
                        </button>
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => { setError(''); setInviting(''); }}>
                            <i className="user plus icon" aria-hidden="true"></i>Invite
                        </button>
                        <span className="classroom-page__menu">
                            <button type="button" className="cb-btn cb-btn--ghost" aria-label="More classroom options"
                                aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
                                <i className="ellipsis horizontal icon" aria-hidden="true"></i>
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                                    <div className="cb-menu__list" role="menu">
                                        <button role="menuitem" onClick={() => { setMenuOpen(false); setRenaming(room.title); }}>
                                            <i className="pencil alternate icon"></i>Rename
                                        </button>
                                        {closed ? (
                                            <button role="menuitem" onClick={() => { setMenuOpen(false); act(() => dispatch(updateClassroom(id, { status: 'open' })), 'Reopened: students can see it again.'); }}>
                                                <i className="lock open icon"></i>Reopen
                                            </button>
                                        ) : (
                                            <button role="menuitem" onClick={() => {
                                                setMenuOpen(false);
                                                setConfirm({
                                                    title: `Close "${room.title}"?`,
                                                    message: 'Students stop seeing it and everything in it. You can still open it, and reopen it any time.',
                                                    label: 'Close',
                                                    run: () => act(() => dispatch(updateClassroom(id, { status: 'closed' })), 'Closed: students can’t see it now.'),
                                                });
                                            }}>
                                                <i className="lock icon"></i>Close
                                            </button>
                                        )}
                                        <button role="menuitem" className="cb-menu__danger" onClick={() => {
                                            setMenuOpen(false);
                                            setConfirm({
                                                title: `Delete "${room.title}"?`,
                                                message: 'The classroom and everything in it are deleted, for you and your students. Copies students saved to their own notebooks stay theirs. This can’t be undone.',
                                                label: 'Delete',
                                                run: async () => {
                                                    setBusy(true);
                                                    try {
                                                        await dispatch(deleteClassroom(id));
                                                        dispatch(fetchMyClassrooms());
                                                        navigate(MY_CLASSROOMS_PATH, { replace: true });
                                                    } catch (err) { setError(err.message); setBusy(false); }
                                                },
                                            });
                                        }}>
                                            <i className="trash alternate outline icon"></i>Delete
                                        </button>
                                    </div>
                                </>
                            )}
                        </span>
                    </span>
                )}
            </div>

            {notice && <p className="teachers-admin__notice">{notice}</p>}
            {error && <p className="cb-sheet__error">{error}</p>}

            {room.items.length === 0 ? (
                <div className="cb-empty">
                    {teacherTools ? 'Nothing here yet. Use Add to send notes, words, notebooks or wordbooks.' : 'Your teacher hasn’t added anything yet.'}
                </div>
            ) : (
                <div className="cb-grid">
                    {room.items.map((item) => (
                        <div key={item.id} className="class-item">
                            <Link to={classroomItemPath(id, item.id)} className="class-item__link">
                                <span className="class-item__type">
                                    <i className={`${itemTypeIcon(item)} icon`} aria-hidden="true"></i>{itemTypeLabel(item)}
                                </span>
                                <span className="class-item__title">{item.title}</span>
                                <span className="class-item__sub">
                                    {item.type === 'notebook'
                                        ? [count(item.wordCount, 'word'), count(item.noteCount, 'note')].filter(Boolean).join(' · ')
                                        : item.preview}
                                </span>
                            </Link>
                            {teacherTools && (
                                <button type="button" className="class-item__remove" title="Take it out of the classroom"
                                    aria-label={`Take ${item.title} out`} onClick={() => setConfirm({
                                        title: `Take "${item.title}" out?`,
                                        message: 'Students won’t see it any more. Copies they already saved stay theirs. Your own original isn’t touched.',
                                        label: 'Take out',
                                        run: () => act(() => dispatch(removeClassroomItem(id, item.id)), `Took out "${item.title}".`),
                                    })}>×</button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <section className="classroom-page__members">
                <h2 className="classrooms-page__heading">
                    {room.role === 'teacher' ? `Students (${joinedCount} joined)` : `Classmates (${joinedCount})`}
                </h2>
                {room.members.length === 0 ? (
                    <p className="classrooms-page__muted">{teacherTools ? 'No one yet. Use Invite.' : 'No one yet.'}</p>
                ) : (
                    <ul className="classroom-page__member-list">
                        {room.members.map((m) => (
                            <li key={m.userName}>
                                <i className="user circle icon" aria-hidden="true"></i>{m.userName}
                                {m.status === 'invited' && <span className="classrooms-page__muted"> · invited</span>}
                                {teacherTools && (
                                    <button type="button" className="class-member__remove" aria-label={`Remove ${m.userName}`}
                                        title={m.status === 'invited' ? 'Cancel the invitation' : 'Remove from the classroom'}
                                        onClick={() => setConfirm({
                                            title: m.status === 'invited' ? `Cancel ${m.userName}'s invitation?` : `Remove ${m.userName}?`,
                                            message: 'They won’t see this classroom any more. Copies they saved stay theirs.',
                                            label: 'Remove',
                                            run: () => act(() => dispatch(removeClassroomMember(id, m.userName)), `Removed ${m.userName}.`),
                                        })}>×</button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {room.role === 'student' && (
                <button type="button" className="cb-btn cb-btn--ghost classroom-page__leave" onClick={() => setConfirm({
                    title: `Leave "${room.title}"?`,
                    message: 'You won’t see this classroom any more. Copies you saved stay yours. To come back, your teacher can invite you again.',
                    label: 'Leave',
                    run: async () => {
                        try {
                            await dispatch(leaveClassroom(id));
                            dispatch(fetchMyClassrooms());
                            navigate(MY_CLASSROOMS_PATH, { replace: true });
                        } catch (err) { setError(err.message); }
                    },
                })}>Leave classroom</button>
            )}

            {inviting !== null && (
                <div className="cb-dialog__overlay" onMouseDown={() => !busy && setInviting(null)}>
                    <form className="cb-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title"
                        onMouseDown={(e) => e.stopPropagation()}
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const who = inviting.trim();
                            if (await act(() => dispatch(inviteToClassroom(id, who)), (m) => `Invited ${m.userName}. They join from My Classrooms.`)) setInviting(null);
                        }}>
                        <h3 className="cb-dialog__title" id="invite-title">Invite a student</h3>
                        <p className="cb-dialog__msg">Type their username. They’ll see the invitation in My Classrooms.</p>
                        <input type="text" className="new-notebook__input" placeholder="Username" aria-label="Username"
                            value={inviting} autoFocus autoComplete="off" onChange={(e) => setInviting(e.target.value)} />
                        {error && <p className="cb-sheet__error">{error}</p>}
                        <div className="cb-dialog__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setInviting(null)}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={busy}>{busy ? 'Inviting…' : 'Invite'}</button>
                        </div>
                    </form>
                </div>
            )}

            {renaming !== null && (
                <div className="cb-dialog__overlay" onMouseDown={() => !busy && setRenaming(null)}>
                    <form className="cb-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-class-title"
                        onMouseDown={(e) => e.stopPropagation()}
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (await act(() => dispatch(updateClassroom(id, { title: renaming })), 'Renamed.')) setRenaming(null);
                        }}>
                        <h3 className="cb-dialog__title" id="rename-class-title">Rename classroom</h3>
                        <input type="text" className="new-notebook__input" aria-label="Classroom name" maxLength={80}
                            value={renaming} autoFocus onChange={(e) => setRenaming(e.target.value)} />
                        {error && <p className="cb-sheet__error">{error}</p>}
                        <div className="cb-dialog__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setRenaming(null)}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={busy}>Save</button>
                        </div>
                    </form>
                </div>
            )}

            {adding && (
                <ClassroomAddDialog classroomId={id} onClose={() => setAdding(false)}
                    onSent={(n) => { setNotice(`Sent ${n === 1 ? '1 item' : `${n} items`}.`); load(); }} />
            )}

            <ConfirmDialog
                open={!!confirm}
                title={confirm ? confirm.title : ''}
                message={confirm ? confirm.message : ''}
                confirmLabel={confirm ? confirm.label : ''}
                cancelLabel="Cancel"
                tone="danger"
                onConfirm={() => { const c = confirm; setConfirm(null); c.run(); }}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
}

export default requireAuth(ClassroomPage);
