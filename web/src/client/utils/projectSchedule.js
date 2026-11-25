// My Projects: works out when each task starts and ends.
//
// A task is stored with how many workdays it takes (`days`) and what it
// waits for (`after`, ids of other tasks in the project). Only a task that
// waits for nothing has a `start` of its own. Every other task starts on the
// first workday after the last task it waits for ends. Because those dates
// are worked out here each time (not saved), changing one task's length
// moves every task after it at once.
//
// Weekends don't count. A task of 5 days that starts on a Thursday runs Thu,
// Fri, Mon, Tue, Wed: it ends on Wednesday, and its bar on the chart still
// spans the weekend in between. A start that falls on a weekend moves to the
// Monday.
//
// Holidays count exactly like weekends (decided): the user keeps one list of
// dates for all their projects, and those days are skipped too. Every
// function below takes them as `off`, a Set of day numbers (holidaySet).
//
// Dates come and go as "YYYY-MM-DD" strings. Inside, each date is a day
// number: days since 1 Jan 1970, counted in UTC so time zones and
// daylight-saving changes can't shift a date by one.
//
// Example:
//   schedule([
//     { id: 'a', days: 5, after: [], start: '2026-11-16' },   // Mon
//     { id: 'b', days: 3, after: ['a'] },
//   ])
//   → Map { 'a' => { start: '2026-11-16', end: '2026-11-20' },   // Mon–Fri
//           'b' => { start: '2026-11-23', end: '2026-11-25' } }  // Mon–Wed

const DAY_MS = 86400000;

/** "YYYY-MM-DD" → day number. */
export function toDay(date) {
    const [y, m, d] = String(date).split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Day number → "YYYY-MM-DD". */
export function fromDay(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today on this computer's calendar, as "YYYY-MM-DD". */
export function todayDate() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 0 = Sunday … 6 = Saturday. Day 0 (1 Jan 1970) was a Thursday. */
export const weekday = (day) => (((day + 4) % 7) + 7) % 7;

const NO_DAYS_OFF = new Set();

/**
 * The holidays as day numbers, for the functions here.
 * @param {Array<string|{date: string}>} [holidays] "YYYY-MM-DD" or { date, name }
 */
export function holidaySet(holidays) {
    return new Set((holidays || []).map((h) => toDay(typeof h === 'string' ? h : h.date)));
}

/** Not a Saturday, a Sunday or a holiday. */
export const isWorkday = (day, off = NO_DAYS_OFF) => weekday(day) !== 0 && weekday(day) !== 6 && !off.has(day);

/** The day itself if it's a workday, else the next one. */
export function nextWorkday(day, off = NO_DAYS_OFF) {
    let d = day;
    // A guard against a list that blocks every day (it can't, but never loop forever).
    for (let n = 0; !isWorkday(d, off) && n < 3660; n += 1) d += 1;
    return d;
}

/**
 * The last workday of a task that starts on `start` and takes `days`
 * workdays (the start day counts as the first).
 */
export function endDay(start, days, off = NO_DAYS_OFF) {
    let d = nextWorkday(start, off);
    for (let left = Math.max(1, days) - 1; left > 0; left -= 1) d = nextWorkday(d + 1, off);
    return d;
}

/**
 * Start and end of every task.
 *
 * @param {Array<{id: string, days: number, after?: string[], start?: string|null}>} tasks
 *   one project's tasks (or several projects': ids are unique)
 * @param {{today?: string, holidays?: Array}} [options] `today`: the date used
 *   for a task with no start (only possible with damaged data), defaults to
 *   today; `holidays`: days skipped like weekends ("YYYY-MM-DD" or { date })
 * @returns {Map<string, {start: string, end: string}>}
 */
export function schedule(tasks, { today = todayDate(), holidays = [] } = {}) {
    const off = holidaySet(holidays);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const days = new Map();         // id → { start, end } as day numbers
    const working = new Set();      // ids being worked out right now (to stop at a loop)

    function place(task) {
        if (days.has(task.id)) return days.get(task.id);
        working.add(task.id);
        // Tasks it waits for that exist (a deleted one is skipped) and aren't
        // part of a loop (the server refuses loops; this is only a guard).
        const before = (task.after || []).map((id) => byId.get(id)).filter((t) => t && !working.has(t.id));
        let start;
        if (before.length) {
            const lastEnd = Math.max(...before.map((t) => place(t).end));
            start = nextWorkday(lastEnd + 1, off);
        } else {
            start = nextWorkday(toDay(task.start || today), off);
        }
        const placed = { start, end: endDay(start, task.days, off) };
        working.delete(task.id);
        days.set(task.id, placed);
        return placed;
    }

    tasks.forEach(place);
    const out = new Map();
    days.forEach((value, id) => out.set(id, { start: fromDay(value.start), end: fromDay(value.end) }));
    return out;
}

/**
 * The tasks that move when `taskId` moves: every task that waits for it,
 * directly or through other tasks. In the order of `tasks`.
 * ("If this changes, Install cabinets, Countertops and Paint move with it.")
 *
 * @returns {string[]} their ids
 */
export function movesWith(tasks, taskId) {
    const moved = new Set([taskId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const t of tasks) {
            if (!moved.has(t.id) && (t.after || []).some((id) => moved.has(id))) {
                moved.add(t.id);
                grew = true;
            }
        }
    }
    moved.delete(taskId);
    return tasks.filter((t) => moved.has(t.id)).map((t) => t.id);
}

/**
 * Before deleting `taskId`: the tasks that wait only for it will then wait
 * for nothing, so they need a start of their own. They keep the start they
 * have now. Sent to the server with the delete (DELETE …/tasks/:id { starts }).
 *
 * @returns {Object<string, string>} { taskId: "YYYY-MM-DD" }
 */
export function startsAfterDeleting(tasks, taskId, options) {
    const now = schedule(tasks, options);
    const starts = {};
    tasks.forEach((t) => {
        const after = t.after || [];
        if (t.id !== taskId && after.length && after.every((id) => id === taskId)) {
            starts[t.id] = now.get(t.id).start;
        }
    });
    return starts;
}

/**
 * Would `taskId` waiting for `after` make a loop (A waits for B, B waits
 * for A)? Used to leave such tasks out of the "Waits for" choices. The
 * server checks this too.
 */
export function makesLoop(tasks, taskId, after) {
    const waitsFor = new Map(tasks.map((t) => [t.id, t.after || []]));
    waitsFor.set(taskId, after);
    const seen = new Set();
    const stack = [...after];
    while (stack.length) {
        const id = stack.pop();
        if (id === taskId) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...(waitsFor.get(id) || []));
    }
    return false;
}

/**
 * First start and last end of a set of scheduled tasks: a project's whole
 * span, the dark line on its row in "All projects". Null when it has none.
 *
 * @param {Map<string, {start: string, end: string}>} placed from schedule()
 * @param {string[]} ids the project's task ids
 */
export function span(placed, ids) {
    const dates = ids.map((id) => placed.get(id)).filter(Boolean);
    if (!dates.length) return null;
    return {
        start: dates.map((d) => d.start).sort()[0],
        end: dates.map((d) => d.end).sort().slice(-1)[0],
    };
}
