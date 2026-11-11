import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyClassrooms } from '../actions';
import { MY_CLASSROOMS_PATH, classroomPath } from '../utils/classroomPaths';

// "My Classrooms" in the desktop side panel (Header), as a tree: the link,
// with the number of invitations waiting, and under it each classroom you
// teach or are in (open ones; your own closed ones say so). The ▸ / ▾ folds
// the list away; that's remembered on this device.
//
// Shown only to people who teach or belong to a classroom, or have an
// invitation. On phones the side panel is the tab bar, so My Classrooms is a
// row on the More page instead (MorePage), and More shows the invitations.
const OPEN_KEY = 'nav-classrooms-open';

const readOpen = () => {
    try { return localStorage.getItem(OPEN_KEY) !== 'no'; } catch (e) { return true; }
};

/** The invitations count, and whether My Classrooms should be offered at all. */
export function useClassroomsSummary() {
    const mine = useSelector((state) => state.myClassrooms);
    if (!mine) return { show: false, invitations: 0 };
    const any = mine.teaching.length || mine.joined.length || mine.invited.length;
    return { show: !!(any || mine.isTeacher), invitations: mine.invited.length };
}

export default function ClassroomsNav({ signedIn }) {
    const dispatch = useDispatch();
    const location = useLocation();
    const mine = useSelector((state) => state.myClassrooms);
    const { show, invitations } = useClassroomsSummary();
    const [open, setOpen] = useState(readOpen);

    // Fresh on each page change: invitations arrive and classrooms close
    // while you use the app.
    useEffect(() => { if (signedIn) dispatch(fetchMyClassrooms()); }, [signedIn, location.pathname, dispatch]);

    if (!signedIn || !show) return null;

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try { localStorage.setItem(OPEN_KEY, next ? 'yes' : 'no'); } catch (e) { /* only a preference */ }
    };
    const rooms = [
        ...mine.teaching.map((r) => ({ ...r, mine: true })),
        ...mine.joined.filter((r) => r.status === 'open'),
    ];

    return (
        <div className="nav-classrooms">
            <span className="nav-classrooms__row">
                <NavLink to={MY_CLASSROOMS_PATH} end className={({ isActive }) => `nav-item nav-classrooms__link${isActive ? ' on' : ''}`}>
                    <span className="nav-icon-wrap">
                        <i className="graduation cap icon"></i>
                        {invitations > 0 && (
                            <span className="nav-badge" aria-label={`${invitations} invitations`}>{invitations}</span>
                        )}
                    </span>
                    <span className="nav-label">My Classrooms</span>
                </NavLink>
                {rooms.length > 0 && (
                    <button type="button" className="nav-classrooms__toggle" aria-expanded={open}
                        aria-label={open ? 'Hide classrooms' : 'Show classrooms'} onClick={toggle}>
                        <i className={`${open ? 'angle down' : 'angle right'} icon`} aria-hidden="true"></i>
                    </button>
                )}
            </span>
            {open && rooms.length > 0 && (
                <div className="nav-classrooms__list">
                    {rooms.map((r) => (
                        <NavLink key={r.id} to={classroomPath(r.id)}
                            className={({ isActive }) => `nav-classrooms__room${isActive || location.pathname.startsWith(`${classroomPath(r.id)}/`) ? ' on' : ''}`}>
                            {r.title}{r.mine && r.status === 'closed' ? ' (closed)' : ''}
                        </NavLink>
                    ))}
                </div>
            )}
        </div>
    );
}
