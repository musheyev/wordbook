import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProjects, createProject } from '../actions';
import { useIsComputer } from '../utils/computerOnly';
import { site } from '../utils/site';

// "My Projects" in the desktop side panel (Header), as a tree like My
// Classrooms (it uses the same look, ClassroomsNav's classes):
//
//   ☰ My Projects        ▾
//     All projects
//     Kitchen remodel
//     Spanish B1 exam
//     + New project
//
// "All projects" shows every project on one timeline; a project's name shows
// just that one (pages/ProjectsPage.js). The ▸ / ▾ folds the list away: it
// starts collapsed until you first open it, then it's remembered on this
// device. "+ New project" turns into a name box: Enter makes the project and
// opens it, Escape cancels.
//
// Computers only (decided): on phones and in the iPhone app there's no link
// at all, and the pages say to use a computer. And myremembrancer.com only
// (decided): makeyourwordbook.com shows no link (utils/site.js `projects`).
const OPEN_KEY = 'nav-projects-open';
export const PROJECTS_PATH = '/projects';
export const projectPath = (id) => `${PROJECTS_PATH}/${encodeURIComponent(id)}`;

// Collapsed until you open it (decided), then as you left it.
const readOpen = () => {
    try { return localStorage.getItem(OPEN_KEY) === 'yes'; } catch (e) { return false; }
};

/**
 * @param {boolean} signedIn
 * @param {boolean} [collapsed] the side panel is folded to icons: just the
 *   link, its name as a tooltip (styles.css hides the list)
 */
export default function ProjectsNav({ signedIn, collapsed }) {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isComputer = useIsComputer();
    const data = useSelector((state) => state.projects);
    const [open, setOpen] = useState(readOpen);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    // Loaded once; saves keep the store up to date after that.
    useEffect(() => {
        if (site.projects && signedIn && isComputer && data === null) dispatch(fetchProjects()).catch(() => {});
    }, [signedIn, isComputer, data, dispatch]);
    useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);

    if (!site.projects || !signedIn || !isComputer) return null;

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try { localStorage.setItem(OPEN_KEY, next ? 'yes' : 'no'); } catch (e) { /* only a preference */ }
    };
    const stopAdding = () => { setAdding(false); setName(''); setError(''); };
    const add = async () => {
        if (!name.trim() || saving) return;
        setSaving(true);
        setError('');
        try {
            const project = await dispatch(createProject(name.trim()));
            stopAdding();
            navigate(projectPath(project.id));
        } catch (err) {
            setError(err.message);
        }
        setSaving(false);
    };
    const projects = (data && data.projects) || [];

    return (
        <div className="nav-classrooms nav-projects">
            <span className="nav-classrooms__row">
                <NavLink to={PROJECTS_PATH} title={collapsed ? 'My Projects' : undefined}
                    className={({ isActive }) => `nav-item nav-classrooms__link${isActive ? ' on' : ''}`}>
                    <i className="tasks icon"></i>
                    <span className="nav-label">My Projects</span>
                </NavLink>
                <button type="button" className="nav-classrooms__toggle" aria-expanded={open}
                    aria-label={open ? 'Hide projects' : 'Show projects'} onClick={toggle}>
                    <i className={`${open ? 'angle down' : 'angle right'} icon`} aria-hidden="true"></i>
                </button>
            </span>
            {open && (
                <div className="nav-classrooms__list">
                    <NavLink to={PROJECTS_PATH} end
                        className={({ isActive }) => `nav-classrooms__room${isActive ? ' on' : ''}`}>
                        All projects
                    </NavLink>
                    {projects.map((p) => (
                        <NavLink key={p.id} to={projectPath(p.id)} title={p.name}
                            className={({ isActive }) => `nav-classrooms__room${isActive ? ' on' : ''}`}>
                            {p.name}
                        </NavLink>
                    ))}
                    {adding ? (
                        <form className="nav-projects__new" onSubmit={(e) => { e.preventDefault(); add(); }}>
                            <input ref={inputRef} className="nav-projects__input" value={name} maxLength={200}
                                placeholder="Project name" aria-label="New project name" disabled={saving}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') stopAdding(); }}
                                onBlur={() => { if (!name.trim()) stopAdding(); }} />
                            {error && <span className="nav-projects__error" role="alert">{error}</span>}
                        </form>
                    ) : (
                        <button type="button" className="nav-classrooms__room nav-projects__add" onClick={() => setAdding(true)}>
                            + New project
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
