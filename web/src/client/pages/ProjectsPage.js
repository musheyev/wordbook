import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProjects, createProject, renameProject, deleteProject, saveProjectsLayout } from '../actions';
import { schedule, span } from '../utils/projectSchedule';
import { ComputerOnly } from '../utils/computerOnly';
import ProjectGantt, { projectColor, shortDate } from '../components/ProjectGantt';
import ProjectTaskWindow from '../components/ProjectTaskWindow';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import { PROJECTS_PATH, projectPath } from '../components/ProjectsNav';
import requireAuth from '../components/hocs/requireAuth';

// My Projects (computers only; decided).
//
//   /projects       All projects on one timeline, each one a group whose
//                   tasks fold away (▸ / ▾, remembered on this device)
//   /projects/:id   one project: its tasks and bars, Rename and Delete
//
// The projects and tasks come from the store (actions: fetchProjects). Each
// task's dates are worked out here from its days and "waits for"
// (utils/projectSchedule.js), so a change to one task redraws every task
// after it. Clicking a task opens its window (ProjectTaskWindow).
const FOLDED_KEY = 'projects-folded';

const readFolded = () => {
    try { return JSON.parse(localStorage.getItem(FOLDED_KEY) || '[]'); } catch (e) { return []; }
};

// Signed out: off to the home page, like the other signed-in pages (requireAuth).
function ProjectsPage() {
    return (
        <ComputerOnly title="My Projects works on a computer.">
            <Projects />
        </ComputerOnly>
    );
}

export default requireAuth(ProjectsPage);

function Projects() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { projectId } = useParams();
    const data = useSelector((state) => state.projects);
    const [loadError, setLoadError] = useState('');
    const [folded, setFolded] = useState(readFolded);
    // The task window: { projectId, task } (task null = a new one), or null.
    const [windowFor, setWindowFor] = useState(null);
    const [naming, setNaming] = useState(null);     // 'new' | 'rename' | null
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (data === null) dispatch(fetchProjects()).catch((err) => setLoadError(err.message));
    }, [data, dispatch]);
    // Another project (or All): close the window and any message.
    useEffect(() => { setWindowFor(null); setError(''); }, [projectId]);

    const projects = data ? data.projects : [];
    const tasks = data ? data.tasks : [];
    const project = projectId ? projects.find((p) => p.id === projectId) : null;
    const colorOf = (id) => projectColor(Math.max(0, projects.findIndex((p) => p.id === id)));
    const placed = useMemo(() => schedule(tasks), [tasks]);

    const rows = useMemo(() => {
        if (projectId) {
            return tasks.filter((t) => t.projectId === projectId)
                .map((task) => ({ kind: 'task', task, color: colorOf(task.projectId) }));
        }
        const out = [];
        projects.forEach((p) => {
            const mine = tasks.filter((t) => t.projectId === p.id);
            const isFolded = folded.includes(p.id);
            out.push({ kind: 'group', project: p, span: span(placed, mine.map((t) => t.id)), folded: isFolded, count: mine.length });
            if (!isFolded) mine.forEach((task) => out.push({ kind: 'task', task, color: colorOf(p.id), indent: true }));
        });
        return out;
    // colorOf only depends on projects
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, projects, tasks, folded, placed]);

    const toggleGroup = (id) => {
        setFolded((was) => {
            const next = was.includes(id) ? was.filter((x) => x !== id) : [...was, id];
            try { localStorage.setItem(FOLDED_KEY, JSON.stringify(next)); } catch (e) { /* only a preference */ }
            return next;
        });
    };

    if (data === null) {
        return <div className="projects-page">{loadError ? <div className="cb-sheet__error">{loadError}</div> : <Spinner label="Loading projects…" />}</div>;
    }
    if (projectId && !project) {
        return (
            <div className="projects-page">
                <div className="cb-empty">That project wasn’t found. It may have been deleted.</div>
            </div>
        );
    }

    const shownTasks = projectId ? tasks.filter((t) => t.projectId === projectId) : tasks;
    const whole = span(placed, shownTasks.map((t) => t.id));
    const meta = projectId
        ? `${shownTasks.length} ${shownTasks.length === 1 ? 'task' : 'tasks'}${whole ? ` · ends ${shortDate(whole.end)}` : ''}`
        : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} · ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;

    const newTask = () => setWindowFor({ projectId: projectId || projects[0].id, task: null });

    const saveName = async (name) => {
        setError('');
        try {
            if (naming === 'new') {
                const p = await dispatch(createProject(name));
                setNaming(null);
                navigate(projectPath(p.id));
            } else {
                await dispatch(renameProject(projectId, name));
                setNaming(null);
            }
        } catch (err) {
            return err.message;
        }
        return '';
    };

    const removeProject = async () => {
        setConfirmingDelete(false);
        try {
            await dispatch(deleteProject(projectId));
            navigate(PROJECTS_PATH);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="projects-page">
            <div className="projects-page__head">
                <h1 className="cb-page-title">{project ? project.name : 'My Projects'}</h1>
                <span className="projects-page__meta">{meta}</span>
                <span className="projects-page__grow" />
                {project ? (
                    <>
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setNaming('rename')}>Rename</button>
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setConfirmingDelete(true)}>Delete</button>
                    </>
                ) : (
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setNaming('new')}>+ Project</button>
                )}
                {projects.length > 0 && <button type="button" className="cb-btn cb-btn--accent" onClick={newTask}>+ Task</button>}
            </div>
            {error && <div className="cb-sheet__error" role="alert">{error}</div>}

            {projects.length === 0 ? (
                <div className="cb-empty">
                    No projects yet. <button type="button" className="projects-page__link" onClick={() => setNaming('new')}>Make your first project</button>,
                    then add its tasks: how many workdays each takes, what it waits for, and who does it.
                </div>
            ) : rows.length === 0 ? (
                <div className="cb-empty">
                    No tasks yet. <button type="button" className="projects-page__link" onClick={newTask}>Add the first task</button>.
                </div>
            ) : (
                <ProjectGantt rows={rows} placed={placed} selectedId={windowFor && windowFor.task ? windowFor.task.id : null}
                    onOpenTask={(task) => setWindowFor({ projectId: task.projectId, task })} onToggleGroup={toggleGroup}
                    layout={data.layout} onLayoutChange={(next) => dispatch(saveProjectsLayout(next))} />
            )}

            {windowFor && (
                <ProjectTaskWindow key={windowFor.task ? windowFor.task.id : `new:${windowFor.projectId}`}
                    target={windowFor} projects={projects} allTasks={tasks} chooseProject={!projectId}
                    onClose={() => setWindowFor(null)} />
            )}

            {naming && (
                <NameDialog title={naming === 'new' ? 'New project' : 'Rename project'}
                    initial={naming === 'rename' && project ? project.name : ''}
                    confirmLabel={naming === 'new' ? 'Make project' : 'Rename'}
                    onSave={saveName} onCancel={() => setNaming(null)} />
            )}
            <ConfirmDialog open={confirmingDelete} tone="danger" confirmLabel="Delete project"
                title={project ? `Delete “${project.name}”?` : ''}
                message={shownTasks.length
                    ? `Its ${shownTasks.length === 1 ? 'task' : `${shownTasks.length} tasks`} will be deleted too. Linked notes stay as they are.`
                    : 'It has no tasks.'}
                onConfirm={removeProject} onCancel={() => setConfirmingDelete(false)} />
        </div>
    );
}

/**
 * A small dialog with one name box (new project, rename). `onSave(name)`
 * resolves to '' when done, or a message to show.
 */
function NameDialog({ title, initial, confirmLabel, onSave, onCancel }) {
    const [name, setName] = useState(initial);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);
    useEffect(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, []);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);

    const submit = async (e) => {
        e.preventDefault();
        if (!name.trim() || saving) return;
        setSaving(true);
        const said = await onSave(name.trim());
        if (said) { setMessage(said); setSaving(false); }
    };

    return createPortal(
        <div className="cb-dialog__overlay" onMouseDown={onCancel}>
            <form className="cb-dialog" role="dialog" aria-modal="true" aria-label={title}
                onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
                <h3 className="cb-dialog__title">{title}</h3>
                <input ref={inputRef} className="projects-page__nameinput" value={name} maxLength={200}
                    placeholder="Project name" onChange={(e) => setName(e.target.value)} />
                {message && <div className="cb-sheet__error" role="alert">{message}</div>}
                <div className="cb-dialog__actions">
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="cb-btn cb-btn--accent" disabled={!name.trim() || saving}>{confirmLabel}</button>
                </div>
            </form>
        </div>,
        document.body,
    );
}
