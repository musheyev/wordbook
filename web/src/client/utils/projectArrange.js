// My Projects: the order of a project's tasks, and their groups.
//
// A project's list ("top") holds groups and the tasks that aren't in a
// group; each group holds its own tasks. Both are kept as plain lists here
// (an "arrangement"), changed by dragging, "Put in group" and "Take out of
// group", then turned back into numbers to save (toPlaces → PUT …/arrange).
//
//   arrangement:
//     { top:    [{ type: 'task', id: 'b' }, { type: 'group', id: 'g1' }],
//       groups: { g1: [{ type: 'task', id: 'a' }, { type: 'task', id: 'c' }] } }
//
// Order and groups never change a task's dates; only its days and "waits
// for" do (projectSchedule.js). Everything here is pure, so it's tested on
// its own (projectArrange.test.js).

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const same = (a, b) => a && b && a.type === b.type && a.id === b.id;

/**
 * One project's arrangement from the store's tasks and groups.
 * A task whose group is gone counts as not in a group.
 */
export function arrangement(projectId, tasks, groups) {
    const mineGroups = groups.filter((g) => g.projectId === projectId).sort(byOrder);
    const groupIds = new Set(mineGroups.map((g) => g.id));
    const mineTasks = tasks.filter((t) => t.projectId === projectId);
    const loose = mineTasks.filter((t) => !t.group || !groupIds.has(t.group));
    const top = [
        ...mineGroups.map((g) => ({ type: 'group', id: g.id, order: g.order })),
        ...loose.map((t) => ({ type: 'task', id: t.id, order: t.order })),
    ].sort(byOrder).map(({ type, id }) => ({ type, id }));
    const inGroups = {};
    mineGroups.forEach((g) => {
        inGroups[g.id] = mineTasks.filter((t) => t.group === g.id).sort(byOrder).map((t) => ({ type: 'task', id: t.id }));
    });
    return { top, groups: inGroups };
}

/** Numbers to save: the list's items 1, 2, 3…, and each group's tasks 1, 2, 3… */
export function toPlaces(arr) {
    const groups = [];
    const tasks = [];
    arr.top.forEach((item, i) => {
        if (item.type === 'group') groups.push({ id: item.id, order: i + 1 });
        else tasks.push({ id: item.id, group: null, order: i + 1 });
    });
    Object.entries(arr.groups).forEach(([groupId, list]) => {
        list.forEach((item, i) => tasks.push({ id: item.id, group: groupId, order: i + 1 }));
    });
    return { groups, tasks };
}

/** The store's tasks and groups with these places applied (shown before the server answers). */
export function applyPlaces(tasks, groups, places) {
    const taskPlace = new Map(places.tasks.map((t) => [t.id, t]));
    const groupPlace = new Map(places.groups.map((g) => [g.id, g]));
    return {
        tasks: tasks.map((t) => (taskPlace.has(t.id) ? { ...t, order: taskPlace.get(t.id).order, group: taskPlace.get(t.id).group } : t)),
        groups: groups.map((g) => (groupPlace.has(g.id) ? { ...g, order: groupPlace.get(g.id).order } : g)),
    };
}

/** A copy with `item` taken out of wherever it is. */
function without(arr, item) {
    const groups = {};
    Object.entries(arr.groups).forEach(([g, list]) => { groups[g] = list.filter((x) => !same(x, item)); });
    return { top: arr.top.filter((x) => !same(x, item)), groups };
}

/** Put `item` into a list before `before` (or at the end). */
function insert(list, item, before) {
    const at = before ? list.findIndex((x) => same(x, before)) : -1;
    if (at < 0) return [...list, item];
    return [...list.slice(0, at), item, ...list.slice(at)];
}

/**
 * Move a task to a place: `{ group, before }` — in that group (null = the
 * project's list), before that item (null = at the end).
 */
export function moveTask(arr, taskId, place) {
    const item = { type: 'task', id: taskId };
    if (same(place.before, item)) return arr;
    const rest = without(arr, item);
    if (place.group && rest.groups[place.group]) {
        return { ...rest, groups: { ...rest.groups, [place.group]: insert(rest.groups[place.group], item, place.before) } };
    }
    return { ...rest, top: insert(rest.top, item, place.before) };
}

/** Move a group, with its tasks, before an item of the project's list (null = at the end). */
export function moveGroup(arr, groupId, before) {
    const item = { type: 'group', id: groupId };
    if (same(before, item)) return arr;
    return { ...arr, top: insert(arr.top.filter((x) => !same(x, item)), item, before) };
}

/** "Put in group": these tasks (in the order given) go to the end of that group. */
export function putInGroup(arr, taskIds, groupId) {
    let next = arr;
    taskIds.forEach((id) => { next = moveTask(next, id, { group: groupId, before: null }); });
    return next;
}

/**
 * "Take out of group": each of these tasks that's in a group goes into the
 * project's list just after its group (several keep their order).
 */
export function takeOut(arr, taskIds) {
    let next = arr;
    const placedAfter = {};   // group id → how many have been put after it so far
    taskIds.forEach((id) => {
        const groupId = Object.keys(next.groups).find((g) => next.groups[g].some((x) => x.id === id));
        if (!groupId) return;
        const rest = without(next, { type: 'task', id });
        const at = rest.top.findIndex((x) => same(x, { type: 'group', id: groupId })) + 1 + (placedAfter[groupId] || 0);
        placedAfter[groupId] = (placedAfter[groupId] || 0) + 1;
        next = { ...rest, top: [...rest.top.slice(0, at), { type: 'task', id }, ...rest.top.slice(at)] };
    });
    return next;
}

/**
 * The rows the chart shows, top to bottom: each group (open or folded), and
 * the tasks of the open ones.
 *
 * @param {Set<string>} folded ids of folded groups
 * @returns {Array<{type: 'group', id, open} | {type: 'task', id, group}>}
 */
export function visibleRows(arr, folded) {
    const rows = [];
    arr.top.forEach((item) => {
        if (item.type === 'group') {
            const open = !folded.has(item.id);
            rows.push({ type: 'group', id: item.id, open });
            if (open) (arr.groups[item.id] || []).forEach((t) => rows.push({ type: 'task', id: t.id, group: item.id }));
        } else {
            rows.push({ type: 'task', id: item.id, group: null });
        }
    });
    return rows;
}

/**
 * Where something dragged lands, from the gap it's over (between rows[gap-1]
 * and rows[gap]). Returns a place for moveTask, or `{ before }` for a group.
 *
 * Tasks: over a task in a group → into that group, before it. Just under an
 * open group's name → first in that group. Under a group's last task →
 * still in that group when `inside` (the pointer is towards the right), else
 * back in the project's list after the group.
 * Groups only move in the project's list, so a gap inside a group counts as
 * the gap after it.
 *
 * @param {Array} rows from visibleRows
 * @param {number} gap 0 … rows.length
 * @param {{type: 'task'|'group', id: string}} dragged
 * @param {boolean} [inside]
 */
export function placeFromRows(rows, gap, dragged, inside = false) {
    const ref = (row) => (row ? { type: row.type, id: row.id } : null);
    if (dragged.type === 'group') {
        let g = gap;
        while (g < rows.length && rows[g].type === 'task' && rows[g].group) g += 1;
        return { group: null, before: ref(rows[g]) };
    }
    const below = rows[gap];
    const above = rows[gap - 1];
    if (below && below.type === 'task' && below.group) return { group: below.group, before: ref(below) };
    if (above && above.type === 'group' && above.open) return { group: above.id, before: null };
    if (above && above.type === 'task' && above.group && inside) return { group: above.group, before: null };
    return { group: null, before: ref(below) };
}
