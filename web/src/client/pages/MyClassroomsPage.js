import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import { fetchMyClassrooms, respondToClassroom, createClassroom, fetchMyTeacherStatus } from '../actions';
import { useIsComputer } from '../utils/computerOnly';
import { classroomPath } from '../utils/classroomPaths';

// My Classrooms (/classrooms; api/classrooms.js), on every device:
//
//   Invitations      a teacher invited you: Join or Decline
//   Teaching         the classrooms you run (+ New classroom, on a computer)
//   My classrooms    the ones you're in; a closed one shows "Closed" and
//                    can't be opened
//
// Teachers create and run classrooms on a computer only; on a phone they can
// still open their classrooms to read them, like a student.
function MyClassroomsPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isComputer = useIsComputer();
    const mine = useSelector((state) => state.myClassrooms);
    const [isTeacher, setIsTeacher] = useState(false);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(null); // the new classroom's name while the window is open

    useEffect(() => { dispatch(fetchMyClassrooms()); }, [dispatch]);
    useEffect(() => {
        if (!isComputer) return;
        dispatch(fetchMyTeacherStatus()).then((me) => setIsTeacher(me.status === 'active'), () => {});
    }, [isComputer, dispatch]);

    const answer = async (id, reply) => {
        setBusy(id);
        setError('');
        try {
            await dispatch(respondToClassroom(id, reply));
            await dispatch(fetchMyClassrooms());
            if (reply === 'join') navigate(classroomPath(id));
        } catch (err) {
            setError(err.message);
        }
        setBusy(null);
    };

    const onCreate = async (e) => {
        e.preventDefault();
        setBusy('#new');
        setError('');
        try {
            const room = await dispatch(createClassroom(creating));
            setCreating(null);
            await dispatch(fetchMyClassrooms());
            navigate(classroomPath(room.id));
        } catch (err) {
            setError(err.message);
        }
        setBusy(null);
    };

    const card = (room, { closedForMe = false } = {}) => (
        closedForMe ? (
            <div key={room.id} className="class-card class-card--closed" title="Your teacher closed this classroom">
                <span className="class-card__title">{room.title}</span>
                <span className="class-card__sub">{room.teacherName} · Closed</span>
            </div>
        ) : (
            <Link key={room.id} to={classroomPath(room.id)} className="class-card">
                <span className="class-card__title">{room.title}</span>
                <span className="class-card__sub">
                    {room.teacherName}{room.status === 'closed' ? ' · Closed' : ''}
                </span>
            </Link>
        )
    );

    const teaching = (mine && mine.teaching) || [];
    const joined = (mine && mine.joined) || [];
    const invited = (mine && mine.invited) || [];
    const nothing = mine && !teaching.length && !joined.length && !invited.length;

    return (
        <div className="cb-account classrooms-page">
            <div className="cb-account__head">
                <h1 className="cb-page-title">My Classrooms</h1>
                {isComputer && isTeacher && (
                    <button type="button" className="cb-btn cb-btn--accent" onClick={() => { setError(''); setCreating(''); }}>
                        <i className="plus icon" aria-hidden="true"></i>New classroom
                    </button>
                )}
            </div>

            {error && <p className="cb-sheet__error">{error}</p>}
            {!mine && <p className="classrooms-page__muted">Loading…</p>}

            {invited.length > 0 && (
                <section className="classrooms-page__section">
                    <h2 className="classrooms-page__heading">Invitations</h2>
                    {invited.map((room) => (
                        <div key={room.id} className="class-invite">
                            <span className="class-invite__text">
                                <strong>{room.title}</strong>
                                <span className="classrooms-page__muted">{room.teacherName} invited you</span>
                            </span>
                            <span className="class-invite__actions">
                                <button type="button" className="cb-btn cb-btn--ghost" disabled={busy === room.id}
                                    onClick={() => answer(room.id, 'decline')}>Decline</button>
                                <button type="button" className="cb-btn cb-btn--accent" disabled={busy === room.id}
                                    onClick={() => answer(room.id, 'join')}>Join</button>
                            </span>
                        </div>
                    ))}
                </section>
            )}

            {teaching.length > 0 && (
                <section className="classrooms-page__section">
                    <h2 className="classrooms-page__heading">Teaching</h2>
                    <div className="cb-grid">{teaching.map((room) => card(room))}</div>
                </section>
            )}

            {joined.length > 0 && (
                <section className="classrooms-page__section">
                    {teaching.length > 0 && <h2 className="classrooms-page__heading">My classrooms</h2>}
                    <div className="cb-grid">
                        {joined.map((room) => card(room, { closedForMe: room.status !== 'open' }))}
                    </div>
                </section>
            )}

            {nothing && (
                <div className="cb-empty">
                    {isComputer && isTeacher
                        ? 'No classrooms yet. Create one with New classroom.'
                        : 'You’re not in any classroom yet. When a teacher invites you, the invitation shows up here.'}
                </div>
            )}

            {creating !== null && (
                <div className="cb-dialog__overlay" onMouseDown={() => busy !== '#new' && setCreating(null)}>
                    <form className="cb-dialog" role="dialog" aria-modal="true" aria-labelledby="new-classroom-title"
                        onMouseDown={(e) => e.stopPropagation()} onSubmit={onCreate}>
                        <h3 className="cb-dialog__title" id="new-classroom-title">New classroom</h3>
                        <input type="text" className="new-notebook__input" placeholder="Spanish 1" aria-label="Classroom name"
                            value={creating} autoFocus maxLength={80} onChange={(e) => setCreating(e.target.value)} />
                        {error && <p className="cb-sheet__error">{error}</p>}
                        <div className="cb-dialog__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setCreating(null)}>Cancel</button>
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={busy === '#new'}>
                                {busy === '#new' ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

export default requireAuth(MyClassroomsPage);
