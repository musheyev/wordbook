import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
    fetchProjects, createProject, renameProject, deleteProject, saveProjectsLayout,
    createTaskGroup, renameTaskGroup, ungroupTaskGroup, arrangeProject,
} from '../actions';
import {
    arrangement, toPlaces, moveTask, moveGroup, putInGroup, takeOut, visibleRows,
} from '../utils/projectArrange';
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
//   /projects/:id   one project: its tasks and bars, Rename and Delete; its
//                   tasks can be dragged, selected and put in groups
//
// Groups fold on both pages (▾, remembered on this device with the projects'
// folds); only a project's own page changes them (decided).
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
    // Select (a project's page): ticked task ids, or null when not selecting.
    const [picked, setPicked] = useState(null);
    // Renaming a group: its id.
    const [renamingGroup, setRenamingGroup] = useState(null);

    useEffect(() => {
        if (data === null) dispatch(fetchProjects()).catch((err) => setLoadError(err.message));
    }, [data, dispatch]);
    // Another project (or All): close the window and any message.
    useEffect(() => { setWindowFor(null); setError(''); setPicked(null); }, [projectId]);

    const projects = data ? data.projects : [];
    const tasks = data ? data.tasks : [];
    const groups = (data && data.groups) || [];
    const project = projectId ? projects.find((p) => p.id === projectId) : null;
    const colorOf = (id) => projectColor(Math.max(0, projects.findIndex((p) => p.id === id)));
    const placed = useMemo(() => schedule(tasks), [tasks]);

    const foldedSet = useMemo(() => new Set(folded), [folded]);
    // This project's list (groups and tasks in order), and the rows shown.
    const arr = useMemo(() => (projectId ? arrangement(projectId, tasks, groups) : null), [projectId, tasks, groups]);
    const dragRows = useMemo(() => (arr ? visibleRows(arr, foldedSet) : null), [arr, foldedSet]);

    const rows = useMemo(() => {
        const taskById = new Map(tasks.map((t) => [t.id, t]));
        const groupById = new Map(groups.map((g) => [g.id, g]));
        /** The rows of one project, its groups and tasks one level in from `level`. */
        const projectRows = (pid, level, editable) => {
            const color = colorOf(pid);
            const a = pid === projectId && arr ? arr : arrangement(pid, tasks, groups);
            return visibleRows(a, foldedSet).map((r) => {
                if (r.type === 'task') return { kind: 'task', task: taskById.get(r.id), color, level: level + (r.group ? 1 : 0) };
                const memberTasks = (a.groups[r.id] || []).map((t) => taskById.get(t.id));
                return {
                    kind: 'group', key: r.id, name: groupById.get(r.id).name, level, folded: !r.open, editable,
                    count: memberTasks.length, members: memberTasks.map((t) => t.id), memberTasks,
                    span: span(placed, memberTasks.map((t) => t.id)),
                };
            });
        };
        if (projectId) return projectRows(projectId, 0, true);
        const out = [];
        projects.forEach((p) => {
            const mine = tasks.filter((t) => t.projectId === p.id);
            const isFolded = foldedSet.has(p.id);
            out.push({
                kind: 'group', key: p.id, name: p.name, level: 0, folded: isFolded, editable: false,
                count: mine.length, members: mine.map((t) => t.id), memberTasks: mine, span: span(placed, mine.map((t) => t.id)),
            });
            if (!isFolded) out.push(...projectRows(p.id, 1, false));
        });
        return out;
    // colorOf only depends on projects
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, projects, tasks, groups, foldedSet, placed, arr]);

    // Save a new arrangement of this project (dragging, Put in group, Take out).
    const saveArrangement = (next) => {
        if (next === arr) return;
        setError('');
        dispatch(arrangeProject(projectId, toPlaces(next))).catch((err) => setError(err.message));
    };
    const onDrop = (dragged, place) => saveArrangement(dragged.type === 'task'
        ? moveTask(arr, dragged.id, place)
        : moveGroup(arr, dragged.id, place.before));

    // Select: tick tasks, then put them in a group or take them out of one.
    const selection = picked ? {
        active: true,
        isPicked: (id) => picked.has(id),
        toggle: (id) => setPicked((was) => { const next = new Set(was); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    } : null;
    /** The ticked tasks, top to bottom (folded groups included). */
    const pickedInOrder = () => (arr && picked ? visibleRows(arr, new Set()).filter((r) => r.type === 'task' && picked.has(r.id)).map((r) => r.id) : []);
    const putPickedIn = (groupId) => { saveArrangement(putInGroup(arr, pickedInOrder(), groupId)); setPicked(new Set()); };
    const takePickedOut = () => { saveArrangement(takeOut(arr, pickedInOrder())); setPicked(new Set()); };
    /** A new group, where the first ticked task is, with the ticked tasks in it. */
    const newGroupForPicked = async (name) => {
        const ids = pickedInOrder();
        const group = await dispatch(createTaskGroup(projectId, name));
        const first = ids[0];
        const inGroup = first && Object.keys(arr.groups).find((g) => arr.groups[g].some((t) => t.id === first));
        const anchor = inGroup ? { type: 'group', id: inGroup } : { type: 'task', id: first };
        const at = arr.top.findIndex((x) => x.type === anchor.type && x.id === anchor.id);
        const top = [...arr.top];
        top.splice(at < 0 ? top.length : at + (inGroup ? 1 : 0), 0, { type: 'group', id: group.id });
        saveArrangement(putInGroup({ top, groups: { ...arr.groups, [group.id]: [] } }, ids, group.id));
        setPicked(new Set());
    };
    const onGroupAction = (groupId, action) => {
        if (action === 'rename') setRenamingGroup(groupId);
        else dispatch(ungroupTaskGroup(projectId, groupId)).catch((err) => setError(err.message));
    };

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
    const shownGroups = projectId ? groups.filter((g) => g.projectId === projectId) : [];
    const whole = span(placed, shownTasks.map((t) => t.id));
    const meta = projectId
        ? `${shownTasks.length} ${shownTasks.length === 1 ? 'task' : 'tasks'}${shownGroups.length ? ` · ${shownGroups.length} ${shownGroups.length === 1 ? 'group' : 'groups'}` : ''}${whole ? ` · ends ${shortDate(whole.end)}` : ''}`
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
                        {shownTasks.length > 0 && (
                            <button type="button" className={`cb-btn cb-btn--ghost${picked ? ' projects-page__on' : ''}`} aria-pressed={!!picked}
                                onClick={() => setPicked(picked ? null : new Set())}>
                                <i className="check square outline icon" aria-hidden="true"></i>Select
                            </button>
                        )}
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setNaming('rename')}>Rename</button>
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setConfirmingDelete(true)}>Delete</button>
                    </>
                ) : (
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setNaming('new')}>+ Project</button>
                )}
                {projects.length > 0 && <button type="button" className="cb-btn cb-btn--accent" onClick={newTask}>+ Task</button>}
            </div>
            {error && <div className="cb-sheet__error" role="alert">{error}</div>}
            {picked && arr && (
                <TaskSelectBar count={picked.size} groups={shownGroups} anyInGroup={pickedInOrder().some((id) => (tasks.find((t) => t.id === id) || {}).group)}
                    allPicked={shownTasks.length > 0 && shownTasks.every((t) => picked.has(t.id))}
                    onPutIn={putPickedIn} onNewGroup={newGroupForPicked} onTakeOut={takePickedOut}
                    onAll={(all) => setPicked(new Set(all ? shownTasks.map((t) => t.id) : []))}
                    onCancel={() => setPicked(null)} />
            )}

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
                    layout={data.layout} onLayoutChange={(next) => dispatch(saveProjectsLayout(next))}
                    selection={selection}
                    dragRows={projectId ? dragRows : null} onDrop={projectId ? onDrop : null}
                    onGroupAction={projectId ? onGroupAction : null} />
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
            {renamingGroup && (
                <NameDialog title="Rename group" placeholder="Group name"
                    initial={(groups.find((g) => g.id === renamingGroup) || {}).name || ''} confirmLabel="Rename"
                    onSave={async (name) => {
                        try { await dispatch(renameTaskGroup(projectId, renamingGroup, name)); setRenamingGroup(null); return ''; } catch (err) { return err.message; }
                    }}
                    onCancel={() => setRenamingGroup(null)} />
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
function NameDialog({ title, initial, confirmLabel, onSave, onCancel, placeholder = 'Project name' }) {
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
                    placeholder={placeholder} onChange={(e) => setName(e.target.value)} />
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

/**
 * The bar shown while selecting tasks (like a notebook's Select):
 *
 *   3 selected  [Put in group ▾]  [Take out of group]        Select all   Cancel
 *
 * "Put in group" lists the project's groups, and "+ New group" with a name box.
 */
function TaskSelectBar({ count, groups, anyInGroup, allPicked, onPutIn, onNewGroup, onTakeOut, onAll, onCancel }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const wrapRef = useRef(null);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setMenuOpen(false); setNaming(false); } };
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [menuOpen]);
    const closeMenu = () => { setMenuOpen(false); setNaming(false); setName(''); setMessage(''); };
    const make = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        try { await onNewGroup(name.trim()); closeMenu(); } catch (err) { setMessage(err.message); }
    };
    return (
        <div className="nb-selectbar projects-selectbar" role="toolbar" aria-label="Selected tasks">
            <span className="nb-selectbar__count">{count === 0 ? 'Tick tasks to group them' : `${count} selected`}</span>
            <span className="projects-selectbar__menuwrap" ref={wrapRef}>
                <button type="button" className="cb-btn cb-btn--ghost" disabled={count === 0} aria-haspopup="menu" aria-expanded={menuOpen}
                    onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}>
                    Put in group <i className="caret down icon" aria-hidden="true"></i>
                </button>
                {menuOpen && (
                    <span className="projects-selectbar__menu" role="menu">
                        {groups.map((g) => (
                            <button key={g.id} type="button" role="menuitem" onClick={() => { onPutIn(g.id); closeMenu(); }}>{g.name}</button>
                        ))}
                        {naming ? (
                            <form className="projects-selectbar__new" onSubmit={make}>
                                <input autoFocus value={name} maxLength={200} placeholder="Group name" aria-label="New group name"
                                    onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') closeMenu(); }} />
                                {message && <span className="nav-projects__error" role="alert">{message}</span>}
                            </form>
                        ) : (
                            <button type="button" role="menuitem" className="projects-selectbar__add" onClick={() => setNaming(true)}>+ New group</button>
                        )}
                    </span>
                )}
            </span>
            <button type="button" className="cb-btn cb-btn--ghost" disabled={!anyInGroup} onClick={onTakeOut}>Take out of group</button>
            <span className="nb-selectbar__spacer" />
            <button type="button" className="nb-selectbar__link" onClick={() => onAll(!allPicked)}>{allPicked ? 'Select none' : 'Select all'}</button>
            <button type="button" className="nb-selectbar__link" onClick={onCancel}>Cancel</button>
        </div>
    );
}
