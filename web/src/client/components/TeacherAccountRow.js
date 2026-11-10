import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { fetchMyTeacherStatus } from '../actions';
import { useIsComputer } from '../utils/computerOnly';

// "Teacher account" at the bottom of My Notebooks, above Account, on a
// computer only (teacher tools aren't on phones; utils/computerOnly.js):
// your teacher status, and a link to /teacher — to ask to become one, or to
// see where your request stands.
const LINES = {
    none: ['Teach with your notes and wordbooks.', 'Become a teacher'],
    requested: ['Your request is waiting for review.', 'See request'],
    active: ['You’re a teacher.', 'Teacher account'],
    declined: ['Your request wasn’t approved.', 'See details'],
    revoked: ['Your teacher account is turned off.', 'See details'],
};

export default function TeacherAccountRow() {
    const dispatch = useDispatch();
    const isComputer = useIsComputer();
    const [status, setStatus] = useState(null);

    useEffect(() => {
        if (!isComputer) return;
        dispatch(fetchMyTeacherStatus()).then((me) => setStatus(me.status), () => setStatus(null));
    }, [isComputer, dispatch]);

    if (!isComputer || !status || !LINES[status]) return null;
    const [text, link] = LINES[status];
    return (
        <div className="account-section teacher-row">
            <div className="account-section__text">
                <strong>Teacher account</strong>
                <span className="account-section__sub">{text}</span>
            </div>
            <Link to="/teacher" className="cb-btn cb-btn--ghost">{link}</Link>
        </div>
    );
}
