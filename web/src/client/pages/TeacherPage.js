import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import { ComputerOnly } from '../utils/computerOnly';
import { fetchMyTeacherStatus, requestTeacherAccount } from '../actions';

// "Become a teacher" (/teacher; api/teachers.js), on a computer. What it
// shows depends on your status:
//
//   none        what teachers can do, and the request form
//   requested   "Your request is waiting for review", with your answers
//   active      "You're a teacher", with a link to My Classrooms
//   declined    the reason, if one was given, and when you can ask again;
//               after that date, the form again
//   revoked     turned off; contact support
//
// For now an admin reviews each request (admin Teachers page). Later a free
// trial and payment take that place; the form stays.
const STUDENTS = [
    { value: '1-10', label: '1–10' },
    { value: '10-30', label: '10–30' },
    { value: '30+', label: '30 or more' },
];
const EMPTY = { displayName: '', subject: '', level: '', students: '', country: '', agreeRules: false };

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '');

function TeacherPage() {
    const dispatch = useDispatch();
    const [me, setMe] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState(EMPTY);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        dispatch(fetchMyTeacherStatus()).then(setMe, (err) => setLoadError(err.message));
    }, [dispatch]);

    const set = (key) => (e) => { setError(''); setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };

    const onSend = async (e) => {
        e.preventDefault();
        // The server checks everything too; this just answers faster.
        if (!form.displayName.trim() || !form.subject.trim() || !form.level.trim() || !form.country.trim()) {
            setError('Fill in every field.');
            return;
        }
        if (!form.students) { setError('Choose about how many students you’ll teach.'); return; }
        if (!form.agreeRules) { setError('Agree to the teacher rules to send your request.'); return; }
        setSending(true);
        try {
            setMe(await dispatch(requestTeacherAccount(form)));
        } catch (err) {
            setError(err.message);
        }
        setSending(false);
    };

    const canAskAgain = me && me.status === 'declined' && Date.now() >= Date.parse(me.canAskAgainAt || 0);
    const showForm = me && (me.status === 'none' || canAskAgain);

    let body;
    if (loadError) {
        body = <p className="cb-sheet__error">{loadError}</p>;
    } else if (!me) {
        body = <p className="teacher-page__muted">Loading…</p>;
    } else if (me.status === 'requested') {
        body = (
            <div className="teacher-page__status">
                <h2>Your request is waiting for review</h2>
                <p>You asked on {day(me.requestedAt)}. We’ll look at it soon; this page will show the answer.</p>
                <dl className="teacher-page__answers">
                    <dt>Name students see</dt><dd>{me.displayName}</dd>
                    <dt>Teaching</dt><dd>{me.subject} · {me.level}</dd>
                    <dt>Students</dt><dd>About {me.students}</dd>
                    <dt>Country</dt><dd>{me.country}</dd>
                </dl>
            </div>
        );
    } else if (me.status === 'active') {
        body = (
            <div className="teacher-page__status">
                <h2>You’re a teacher</h2>
                <p>Students will see you as <strong>{me.displayName}</strong>.</p>
                <p><Link to="/classrooms">Go to My Classrooms</Link> to create a classroom and invite your students.</p>
            </div>
        );
    } else if (me.status === 'revoked') {
        body = (
            <div className="teacher-page__status">
                <h2>Your teacher account is turned off</h2>
                <p>To talk about it, use the address on the <Link to="/support">Support</Link> page.</p>
            </div>
        );
    } else if (me.status === 'declined' && !canAskAgain) {
        body = (
            <div className="teacher-page__status">
                <h2>Your request wasn’t approved</h2>
                {me.declineReason && <p>Reason: {me.declineReason}</p>}
                <p>You can ask again on {day(me.canAskAgainAt)}.</p>
            </div>
        );
    }

    return (
        <ComputerOnly>
            <div className="teacher-page">
                <h1 className="cb-page-title">Become a teacher</h1>
                <p className="teacher-page__intro">
                    Teachers make classrooms: they share notes, words and wordbooks with the students they invite.
                    Students read and listen, and can save copies to their own notebooks.
                </p>

                {body}

                {showForm && (
                    <form className="teacher-page__form" onSubmit={onSend}>
                        {me.status === 'declined' && (
                            <p className="teacher-page__muted">Your earlier request wasn’t approved. You can ask again now.</p>
                        )}
                        <label>
                            <span>Name students will see</span>
                            <input type="text" value={form.displayName} onChange={set('displayName')} maxLength={60}
                                placeholder="Ms. Rivera" />
                        </label>
                        <label>
                            <span>What you’ll teach</span>
                            <input type="text" value={form.subject} onChange={set('subject')} maxLength={100}
                                placeholder="Spanish, Hebrew, vocabulary for the SAT…" />
                        </label>
                        <label>
                            <span>Level</span>
                            <input type="text" value={form.level} onChange={set('level')} maxLength={100}
                                placeholder="Beginners, 8th grade, adults…" />
                        </label>
                        <fieldset>
                            <legend>About how many students</legend>
                            <span className="teacher-page__choices">
                                {STUDENTS.map((s) => (
                                    <label key={s.value} className={`teacher-page__choice${form.students === s.value ? ' on' : ''}`}>
                                        <input type="radio" name="students" value={s.value}
                                            checked={form.students === s.value} onChange={set('students')} />
                                        {s.label}
                                    </label>
                                ))}
                            </span>
                        </fieldset>
                        <label>
                            <span>Country</span>
                            <input type="text" value={form.country} onChange={set('country')} maxLength={60}
                                placeholder="United States" />
                        </label>
                        <label className="teacher-page__agree">
                            <input type="checkbox" checked={form.agreeRules} onChange={set('agreeRules')} />
                            <span>
                                I agree to the <Link to="/teacher/rules" target="_blank" rel="noopener">teacher rules</Link>.
                            </span>
                        </label>
                        {error && <p className="cb-sheet__error">{error}</p>}
                        <div className="teacher-page__actions">
                            <button type="submit" className="cb-btn cb-btn--accent" disabled={sending}>
                                {sending ? 'Sending…' : 'Send request'}
                            </button>
                            <span className="teacher-page__muted">An admin reviews each request.</span>
                        </div>
                    </form>
                )}
            </div>
        </ComputerOnly>
    );
}

export default requireAuth(TeacherPage);
