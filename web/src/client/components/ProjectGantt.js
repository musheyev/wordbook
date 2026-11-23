import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toDay, fromDay, weekday, todayDate } from '../utils/projectSchedule';

// The Gantt chart of My Projects (pages/ProjectsPage.js): a table of tasks on
// the left, and on the right a timeline with one bar per task.
//
//   TASK            STARTS  DAYS  WHO            │ Nov          Dec
//                                                │ 16   23   30   7
//   Measure & plan  Nov 16   5                   │ ███▌
//   Pick cabinets   Nov 23   7    (M) Mike        │    └▶███████
//
// - A bar runs from the task's first day to its last; it spans the weekends
//   in between (they're shaded), which the task's days don't count.
// - An arrow goes from the end of each task to the start of every task that
//   waits for it.
// - The red line is today.
// - "All projects" puts each project in a group: its row shows the project's
//   whole span as a dark line, and ▸ / ▾ folds its tasks away.
//
// It's built from plain boxes (divs) placed by their dates, and one SVG
// drawing on top for the arrows. No chart library: the layout is simple, and
// this keeps it looking like the rest of the app.
//
// The table stays put when the timeline is scrolled sideways (position:
// sticky). How wide a day is depends on the room there is: the whole span
// fits when it can, and scrolls when a day would get narrower than MIN_DAY.

const ROW_H = 38;
const HEAD_H = 46;
const MIN_DAY = 6;
const MAX_DAY = 36;

/** The table's columns. Widths are fixed for now (resizing comes later). */
const COLUMNS = [
    { key: 'name', label: 'Task', width: 230 },
    { key: 'start', label: 'Starts', width: 74 },
    { key: 'days', label: 'Days', width: 52 },
    { key: 'who', label: 'Who', width: 150 },
    { key: 'notes', label: '', width: 46 },
];
const TABLE_W = COLUMNS.reduce((sum, c) => sum + c.width, 0);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-28" → "Nov 28". */
export const shortDate = (date) => {
    const [, m, d] = date.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
};

/** A colour for each project, by its place in the list. */
const PROJECT_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#4d7c0f', '#b91c1c'];
export const projectColor = (index) => PROJECT_COLORS[index % PROJECT_COLORS.length];

/** A steady colour for a person's initial, from their name. */
const PERSON_COLORS = ['#7c3aed', '#0891b2', '#b45309', '#db2777', '#15803d', '#4338ca', '#be123c', '#0f766e'];
export function personColor(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return PERSON_COLORS[h % PERSON_COLORS.length];
}

/** A person's initial in a coloured circle, then their name. */
export function Person({ name }) {
    if (!name) return null;
    return (
        <span className="pg-who">
            <i className="pg-who__dot" style={{ background: personColor(name) }} aria-hidden="true">
                {Array.from(name)[0].toUpperCase()}
            </i>
            <span className="pg-who__name">{name}</span>
        </span>
    );
}

/** Measures an element's width, and again whenever it changes. */
function useWidth(ref) {
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        if (!ref.current) return undefined;
        const measure = () => setWidth(ref.current ? ref.current.clientWidth : 0);
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}

/**
 * The days the timeline shows: from a Monday a little before the first task
 * (or today) to a Sunday a little after the last one.
 */
function dayRange(placedList, today) {
    const starts = placedList.map((p) => toDay(p.start));
    const ends = placedList.map((p) => toDay(p.end));
    let first = Math.min(today, ...starts) - 3;
    let last = Math.max(today, ...ends) + 10;
    while (weekday(first) !== 1) first -= 1;
    while (weekday(last) !== 0) last += 1;
    return { first, last, count: last - first + 1 };
}

/**
 * @param {object} props
 * @param {Array} props.rows what to draw, top to bottom:
 *   { kind: 'group', project, color, span: {start,end}|null, folded, count }
 *   or { kind: 'task', task, color, indent }
 * @param {Map<string, {start: string, end: string}>} props.placed every task's
 *   dates (projectSchedule.schedule)
 * @param {string|null} props.selectedId the task open in the task window
 * @param {(task) => void} props.onOpenTask
 * @param {(projectId) => void} [props.onToggleGroup]
 */
export default function ProjectGantt({ rows, placed, selectedId, onOpenTask, onToggleGroup }) {
    const boxRef = useRef(null);
    const boxWidth = useWidth(boxRef);
    const today = toDay(todayDate());

    const range = useMemo(() => dayRange([...placed.values()], today), [placed, today]);
    const room = Math.max(0, boxWidth - TABLE_W - 2);
    const dayW = Math.max(MIN_DAY, Math.min(MAX_DAY, room ? room / range.count : MIN_DAY));
    const timelineW = Math.round(range.count * dayW);
    const x = (date) => (toDay(date) - range.first) * dayW;

    // Month names over the 1st of each month (and the first day shown); the
    // day of the month over each Monday.
    const marks = [];
    for (let i = 0; i < range.count; i += 1) {
        const day = range.first + i;
        const date = fromDay(day);
        const dom = Number(date.slice(8));
        if (dom === 1 || i === 0) {
            const year = date.slice(0, 4) !== fromDay(today).slice(0, 4) ? ` ${date.slice(0, 4)}` : '';
            marks.push(<span key={`m${i}`} className="pg-scale__month" style={{ left: i * dayW + 3 }}>{MONTHS[Number(date.slice(5, 7)) - 1]}{year}</span>);
        }
        if (weekday(day) === 1) marks.push(<span key={`w${i}`} className="pg-scale__week" style={{ left: i * dayW + 3 }}>{dom}</span>);
    }

    // Shading for weekends, and a line at each Monday.
    const backdrop = [];
    for (let i = 0; i < range.count; i += 1) {
        const wd = weekday(range.first + i);
        if (wd === 6) backdrop.push(<div key={`we${i}`} className="pg-weekend" style={{ left: i * dayW, width: dayW * 2 }} />);
        if (wd === 1 && i > 0) backdrop.push(<div key={`gl${i}`} className="pg-gridline" style={{ left: i * dayW }} />);
    }

    // Arrows: from the end of each task to the start of each task waiting
    // for it, when both rows are showing. Down to the waiting task's row,
    // with a jog back left when it starts right after (it usually does).
    const rowOf = new Map();
    rows.forEach((r, i) => { if (r.kind === 'task') rowOf.set(r.task.id, i); });
    const arrows = [];
    rows.forEach((r, i) => {
        if (r.kind !== 'task') return;
        (r.task.after || []).forEach((beforeId) => {
            const j = rowOf.get(beforeId);
            const a = placed.get(beforeId);
            const b = placed.get(r.task.id);
            if (j === undefined || !a || !b) return;
            const xe = x(a.end) + dayW;
            const xs = x(b.start);
            const y1 = j * ROW_H + ROW_H / 2;
            const y2 = i * ROW_H + ROW_H / 2;
            const d = xs >= xe + 14
                ? `M${xe} ${y1} H${xe + 7} V${y2} H${xs - 1}`
                : `M${xe} ${y1} H${xe + 7} V${y2 + (y2 > y1 ? -ROW_H / 2 : ROW_H / 2)} H${xs - 8} V${y2} H${xs - 1}`;
            arrows.push(<path key={`${beforeId}>${r.task.id}`} d={d} />);
        });
    });

    const todayX = (today - range.first) * dayW;

    return (
        <div className="pg" ref={boxRef}>
            <div className="pg__inner" style={{ width: TABLE_W + timelineW }}>
                <div className="pg__head" style={{ height: HEAD_H }}>
                    <div className="pg__cells pg__cells--head" style={{ width: TABLE_W }}>
                        {COLUMNS.map((c) => <div key={c.key} className="pg__th" style={{ width: c.width }}>{c.label}</div>)}
                    </div>
                    <div className="pg-scale" style={{ width: timelineW }}>{marks}</div>
                </div>

                <div className="pg__body">
                    {rows.map((r) => (r.kind === 'group' ? (
                        <div key={`g${r.project.id}`} className="pg__row pg__row--group" style={{ height: ROW_H }}>
                            <div className="pg__cells" style={{ width: TABLE_W }}>
                                <button type="button" className="pg__groupname" aria-expanded={!r.folded}
                                    onClick={() => onToggleGroup && onToggleGroup(r.project.id)}>
                                    <i className={`${r.folded ? 'caret right' : 'caret down'} icon`} aria-hidden="true"></i>
                                    {r.project.name}
                                    <span className="pg__groupcount">{r.count}</span>
                                </button>
                            </div>
                            <div className="pg__track" style={{ width: timelineW }}>
                                {r.span && (
                                    <div className="pg-bar pg-bar--span" title={`${r.project.name}: ${shortDate(r.span.start)} – ${shortDate(r.span.end)}`}
                                        style={{ left: x(r.span.start), width: x(r.span.end) + dayW - x(r.span.start) }} />
                                )}
                            </div>
                        </div>
                    ) : (
                        <TaskRow key={r.task.id} row={r} dates={placed.get(r.task.id)} x={x} dayW={dayW}
                            timelineW={timelineW} selected={r.task.id === selectedId} onOpen={onOpenTask} />
                    )))}

                    {/* Weekends, week lines, today and the arrows, over the timeline part. */}
                    <div className="pg__overlay" style={{ left: TABLE_W, width: timelineW, height: rows.length * ROW_H }}>
                        {backdrop}
                        {todayX >= 0 && todayX <= timelineW && (
                            <div className="pg-today" style={{ left: todayX + dayW / 2 }}><span>Today</span></div>
                        )}
                        <svg className="pg-arrows" width={timelineW} height={rows.length * ROW_H} aria-hidden="true">
                            <defs>
                                <marker id="pg-arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                                    <path d="M0 0 8 4 0 8z" />
                                </marker>
                            </defs>
                            {arrows}
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** One task: its cells in the table, its bar on the timeline. Click either to open it. */
function TaskRow({ row, dates, x, dayW, timelineW, selected, onOpen }) {
    const { task, color, indent } = row;
    const open = () => onOpen(task);
    const label = dates ? `${task.name}: ${shortDate(dates.start)} – ${shortDate(dates.end)}, ${task.days} ${task.days === 1 ? 'day' : 'days'}` : task.name;
    return (
        <div className={`pg__row${selected ? ' pg__row--on' : ''}`} style={{ height: ROW_H }}>
            <div className="pg__cells" style={{ width: TABLE_W }}>
                <button type="button" className="pg__td pg__taskname" style={{ width: COLUMNS[0].width, paddingLeft: indent ? 30 : 8 }}
                    onClick={open} title={task.name}>
                    {task.name}
                </button>
                <div className="pg__td pg__td--dim" style={{ width: COLUMNS[1].width }}>{dates ? shortDate(dates.start) : ''}</div>
                <div className="pg__td pg__td--dim" style={{ width: COLUMNS[2].width }}>{task.days}</div>
                <div className="pg__td" style={{ width: COLUMNS[3].width }}><Person name={task.who} /></div>
                <div className="pg__td" style={{ width: COLUMNS[4].width }}>
                    {task.notes && task.notes.length > 0 && (
                        <span className="pg__notes" title={`${task.notes.length} linked ${task.notes.length === 1 ? 'note' : 'notes'}`}>
                            <i className="file alternate outline icon" aria-hidden="true"></i>{task.notes.length}
                        </span>
                    )}
                </div>
            </div>
            <div className="pg__track" style={{ width: timelineW }}>
                {dates && (
                    <button type="button" className={`pg-bar${selected ? ' pg-bar--on' : ''}`} onClick={open} title={label} aria-label={label}
                        style={{ left: x(dates.start), width: x(dates.end) + dayW - x(dates.start), background: color }} />
                )}
            </div>
        </div>
    );
}
