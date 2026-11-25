import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { saveTask, deleteTask, openNoteWindow } from '../actions';
import { schedule, movesWith, makesLoop, startsAfterDeleting, todayDate } from '../utils/projectSchedule';
import { noteLinkHref } from '../utils/noteLinks';
import { Person, personColor, shortDate } from './ProjectGantt';
import NoteLinkPicker from './NoteLinkPicker';
import ConfirmDialog from './ConfirmDialog';
import ColorSwatches from './ColorSwatches';

// A task's window in My Projects, opened by clicking a task or its bar, or
// by "+ Task". It looks like a note window and sits at the bottom right.
//
//   Order cabinets                       Kitchen remodel   ✕
//   ───────────────────────────────────────────────────────
//   Task       [Order cabinets              ]
//   Who        [Mi|            ]  ← names used before are offered
//   Waits for  (Pick cabinets ×)  [+ Add ▾]
//   Starts     Nov 30 · when Pick cabinets ends
//   Takes      [14] workdays   ends Dec 17
//   Notes      (Cabinet quotes ×)  🔗 Add link
//   Colour     (● Same as group) ● ● ● ● ● ● ● ●
//   If this changes, Install cabinets and Paint move with it.
//   [Delete task]                          [Cancel] [Save]
//
// Nothing is saved until Save. "Starts" is a date only for a task that
// waits for nothing; one that waits starts the workday after the last thing
// it waits for ends (utils/projectSchedule.js), so it shows that instead.
// Removing the last "waits for" keeps the start it had.

/**
 * @param {object} props
 * @param {{projectId: string, task: object|null}} props.target the task to
 *   edit, or task null for a new one in that project
 * @param {Array<{id, name}>} props.projects for choosing the project of a new
 *   task (on "All projects")
 * @param {Array} props.allTasks every task (for the names offered under Who)
 * @param {Array<{date, name}>} [props.holidays] skipped like weekends in the dates shown
 * @param {boolean} [props.chooseProject] a new task can go in any project
 * @param {(projectId, task) => {hex: string, label: string}} [props.autoColor] what the
 *   task looks like with no colour of its own (its group's or its project's)
 *   (on "All projects"); on a project's own page it goes in that one
 * @param {() => void} props.onClose
 */
export default function ProjectTaskWindow({ target, projects, allTasks, chooseProject = false, holidays = [], autoColor, onClose }) {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isNew = !target.task;
    const [projectId, setProjectId] = useState(target.projectId);
    const [draft, setDraft] = useState(() => (target.task
        ? { ...target.task, after: [...(target.task.after || [])], notes: [...(target.task.notes || [])] }
        : { name: '', days: 1, after: [], start: todayDate(), who: '', notes: [], color: null }));
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [picking, setPicking] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const nameRef = useRef(null);

    useEffect(() => { if (isNew && nameRef.current) nameRef.current.focus(); }, [isNew]);

    // Escape closes, unless a picker or dialog on top is open (it closes first).
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !picking && !confirmingDelete) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, picking, confirmingDelete]);

    const project = projects.find((p) => p.id === projectId);
    const others = allTasks.filter((t) => t.projectId === projectId && t.id !== draft.id);
    const selfId = draft.id || '(new)';
    // The project as it would be with this draft saved: for the dates shown here.
    const withDraft = useMemo(() => [...others, { ...draft, id: selfId }], [others, draft, selfId]);
    const placed = useMemo(() => schedule(withDraft, { holidays }), [withDraft, holidays]);
    const mine = placed.get(selfId);
    const nameOf = (id) => (others.find((t) => t.id === id) || {}).name || '';
    const set = (fields) => setDraft((d) => ({ ...d, ...fields }));

    // "Waits for": tasks of this project not chosen yet that wouldn't make a loop.
    const canWaitFor = others.filter((t) => !draft.after.includes(t.id) && !makesLoop(withDraft, selfId, [...draft.after, t.id]));
    const addAfter = (id) => { if (id) set({ after: [...draft.after, id], start: null }); };
    const removeAfter = (id) => {
        const after = draft.after.filter((x) => x !== id);
        // Waiting for nothing now: it keeps the start it has.
        set(after.length ? { after } : { after, start: mine ? mine.start : todayDate() });
    };

    const lastBefore = draft.after.length && mine
        ? draft.after.map((id) => ({ id, end: (placed.get(id) || {}).end || '' })).sort((a, b) => b.end.localeCompare(a.end))[0]
        : null;
    const moving = draft.id ? movesWith(allTasks.filter((t) => t.projectId === projectId), draft.id).map(nameOf) : [];

    const openNote = (n) => {
        if (n.type === 'card') dispatch(openNoteWindow({ id: n.id, title: n.title }));
        else navigate(noteLinkHref(n.type, n.id));
    };
    const addNote = (item) => {
        setPicking(false);
        if (!draft.notes.some((n) => n.type === item.type && n.id === item.id)) {
            set({ notes: [...draft.notes, { type: item.type, id: item.id, title: item.title }] });
        }
    };

    const save = async () => {
        if (!draft.name.trim()) { setError('Give the task a name.'); return; }
        const days = Number(draft.days);
        if (!Number.isInteger(days) || days < 1) { setError('Days must be a whole number, 1 or more.'); return; }
        setSaving(true);
        setError('');
        try {
            await dispatch(saveTask(projectId, { ...draft, name: draft.name.trim(), days, who: draft.who.trim() }));
            onClose();
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    const remove = async () => {
        setConfirmingDelete(false);
        setSaving(true);
        try {
            const projectTasks = allTasks.filter((t) => t.projectId === projectId);
            await dispatch(deleteTask(projectId, draft.id, startsAfterDeleting(projectTasks, draft.id, { holidays })));
            onClose();
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    const waiting = allTasks.filter((t) => (t.after || []).includes(draft.id)).map((t) => t.name);

    return createPortal(
        <div className="ptw" role="dialog" aria-label={isNew ? 'New task' : `Task: ${draft.name}`}>
            <div className="ptw__head">
                <b className="ptw__title">{isNew ? 'New task' : (target.task.name || 'Task')}</b>
                <span className="ptw__from">{project ? project.name : ''}</span>
                <button type="button" className="ptw__close" aria-label="Close" title="Close" onClick={onClose}>
                    <i className="close icon" aria-hidden="true"></i>
                </button>
            </div>

            <form className="ptw__body" onSubmit={(e) => { e.preventDefault(); save(); }}>
                {isNew && chooseProject && projects.length > 1 && (
                    <label className="ptw__row">
                        <span className="ptw__k">Project</span>
                        <select className="ptw__input" value={projectId}
                            onChange={(e) => { setProjectId(e.target.value); set({ after: [], start: mine ? mine.start : todayDate() }); }}>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </label>
                )}

                <label className="ptw__row">
                    <span className="ptw__k">Task</span>
                    <input ref={nameRef} className="ptw__input ptw__input--wide" value={draft.name} maxLength={200}
                        placeholder="What needs doing" onChange={(e) => set({ name: e.target.value })} />
                </label>

                <div className="ptw__row">
                    <span className="ptw__k">Who</span>
                    <WhoField value={draft.who} allTasks={allTasks} onChange={(who) => set({ who })} />
                </div>

                <div className="ptw__row ptw__row--wrap">
                    <span className="ptw__k">Waits for</span>
                    {draft.after.map((id) => (
                        <span key={id} className="ptw__chip">
                            {nameOf(id)}
                            <button type="button" className="ptw__x" aria-label={`Stop waiting for ${nameOf(id)}`} onClick={() => removeAfter(id)}>×</button>
                        </span>
                    ))}
                    {canWaitFor.length > 0 && (
                        <select className="ptw__addsel" value="" aria-label="Add a task this one waits for"
                            onChange={(e) => addAfter(e.target.value)}>
                            <option value="">+ Add</option>
                            {canWaitFor.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    )}
                    {!draft.after.length && !canWaitFor.length && <span className="ptw__hint">Nothing else in this project yet</span>}
                </div>

                <div className="ptw__row">
                    <span className="ptw__k">Starts</span>
                    {draft.after.length ? (
                        <span className="ptw__locked" title="Set by what it waits for">
                            {mine ? shortDate(mine.start) : ''}{lastBefore ? ` · when ${nameOf(lastBefore.id)} ends` : ''}
                        </span>
                    ) : (
                        <input type="date" className="ptw__input" value={draft.start || ''} required
                            onChange={(e) => set({ start: e.target.value })} />
                    )}
                </div>

                <div className="ptw__row">
                    <span className="ptw__k">Takes</span>
                    <input type="number" min="1" max="999" step="1" className="ptw__input ptw__input--days" value={draft.days}
                        onChange={(e) => set({ days: e.target.value === '' ? '' : Number(e.target.value) })} />
                    <span className="ptw__hint">workdays{mine ? ` · ends ${shortDate(mine.end)}` : ''}</span>
                </div>

                <div className="ptw__row ptw__row--wrap">
                    <span className="ptw__k">Notes</span>
                    {draft.notes.map((n) => (
                        <span key={`${n.type}:${n.id}`} className="ptw__chip ptw__chip--note">
                            <button type="button" className="ptw__chiplink" onClick={() => openNote(n)} title="Open">{n.title || n.id}</button>
                            <button type="button" className="ptw__x" aria-label={`Unlink ${n.title || n.id}`}
                                onClick={() => set({ notes: draft.notes.filter((m) => m !== n) })}>×</button>
                        </span>
                    ))}
                    <button type="button" className="ptw__addlink" onClick={() => setPicking(true)}>
                        <i className="linkify icon" aria-hidden="true"></i>Add link
                    </button>
                </div>

                {autoColor && (
                    <div className="ptw__row ptw__row--wrap">
                        <span className="ptw__k">Colour</span>
                        <ColorSwatches value={draft.color || null} auto={autoColor(projectId, target.task)}
                            onChange={(color) => set({ color })} />
                    </div>
                )}

                {moving.length > 0 && (
                    <div className="ptw__ripple">If this changes, {listNames(moving)} {moving.length === 1 ? 'moves' : 'move'} with it.</div>
                )}
                {error && <div className="cb-sheet__error" role="alert">{error}</div>}

                <div className="ptw__actions">
                    {!isNew && (
                        <button type="button" className="cb-btn cb-btn--ghost ptw__delete" disabled={saving}
                            onClick={() => setConfirmingDelete(true)}>Delete task</button>
                    )}
                    <span className="ptw__spacer" />
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="cb-btn cb-btn--accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </form>

            <NoteLinkPicker open={picking} onClose={() => setPicking(false)} onPick={addNote} />
            <ConfirmDialog open={confirmingDelete} tone="danger" confirmLabel="Delete"
                title={`Delete “${draft.name}”?`}
                message={waiting.length === 1
                    ? `${waiting[0]} will stop waiting for it and keep the date it has now. Linked notes stay as they are.`
                    : waiting.length
                        ? `${listNames(waiting)} will stop waiting for it and keep the dates they have now. Linked notes stay as they are.`
                        : 'Linked notes stay as they are.'}
                onConfirm={remove} onCancel={() => setConfirmingDelete(false)} />
        </div>,
        document.body,
    );
}

/** "A", "A and B", "A, B and C". */
function listNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Who does the task: one name, typed. While typing, names used on other
 * tasks that match are offered; if it's new, "+ Add “…” as a new name". What's
 * typed is kept either way (people are just names, not accounts).
 */
function WhoField({ value, allTasks, onChange }) {
    const [open, setOpen] = useState(false);
    const known = useMemo(() => [...new Set(allTasks.map((t) => (t.who || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)), [allTasks]);
    const typed = value.trim();
    const matches = typed ? known.filter((n) => n.toLowerCase().includes(typed.toLowerCase())) : known;
    const exact = known.some((n) => n.toLowerCase() === typed.toLowerCase());
    const pick = (name) => { onChange(name); setOpen(false); };

    return (
        <span className="ptw__who">
            {value && exact && <i className="pg-who__dot" style={{ background: personColor(typed) }} aria-hidden="true">{Array.from(typed)[0].toUpperCase()}</i>}
            <input className="ptw__input" value={value} maxLength={80} placeholder="Nobody"
                aria-label="Who does it" autoComplete="off"
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }} />
            {open && (matches.length > 0 || (typed && !exact)) && (
                <span className="ptw__menu" role="listbox">
                    {matches.filter((n) => n !== typed).slice(0, 8).map((n) => (
                        <button key={n} type="button" role="option" aria-selected="false" className="ptw__menuitem"
                            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(n)}>
                            <Person name={n} />
                        </button>
                    ))}
                    {typed && !exact && (
                        <button type="button" className="ptw__menuitem ptw__menuitem--add"
                            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(typed)}>
                            + Add “{typed}” as a new name
                        </button>
                    )}
                </span>
            )}
        </span>
    );
}
