// Tests for the order and groups of a project's tasks (projectArrange.js).
// Run with:  npm test   (in web/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    arrangement, toPlaces, applyPlaces, moveTask, moveGroup, putInGroup, takeOut, visibleRows, placeFromRows,
} from './projectArrange.js';

// Project p: list = B, G(A, C), D
const tasks = [
    { id: 'a', projectId: 'p', order: 1, group: 'g' },
    { id: 'b', projectId: 'p', order: 1, group: null },
    { id: 'c', projectId: 'p', order: 2, group: 'g' },
    { id: 'd', projectId: 'p', order: 3, group: null },
    { id: 'x', projectId: 'other', order: 1, group: null },
];
const groups = [{ id: 'g', projectId: 'p', order: 2, name: 'G' }];
const arr = arrangement('p', tasks, groups);
const names = (a) => a.top.map((i) => (i.type === 'group' ? `[${i.id}:${a.groups[i.id].map((t) => t.id).join('')}]` : i.id)).join(' ');

test('arrangement reads the list and each group, for one project', () => {
    assert.equal(names(arr), 'b [g:ac] d');
});

test('a task whose group is gone counts as not grouped', () => {
    const lost = arrangement('p', [{ id: 'a', projectId: 'p', order: 1, group: 'gone' }], []);
    assert.equal(names(lost), 'a');
});

test('toPlaces numbers the list and each group from 1', () => {
    assert.deepEqual(toPlaces(arr), {
        groups: [{ id: 'g', order: 2 }],
        tasks: [
            { id: 'b', group: null, order: 1 }, { id: 'd', group: null, order: 3 },
            { id: 'a', group: 'g', order: 1 }, { id: 'c', group: 'g', order: 2 },
        ],
    });
});

test('applyPlaces updates order and group, leaves the rest', () => {
    const next = applyPlaces(tasks, groups, { groups: [{ id: 'g', order: 9 }], tasks: [{ id: 'd', group: 'g', order: 3 }] });
    assert.equal(next.tasks.find((t) => t.id === 'd').group, 'g');
    assert.equal(next.groups[0].order, 9);
    assert.equal(next.tasks.find((t) => t.id === 'x').order, 1);
});

test('moveTask: within the list, into a group, out of a group', () => {
    assert.equal(names(moveTask(arr, 'd', { group: null, before: { type: 'task', id: 'b' } })), 'd b [g:ac]');
    assert.equal(names(moveTask(arr, 'd', { group: 'g', before: { type: 'task', id: 'c' } })), 'b [g:adc]');
    assert.equal(names(moveTask(arr, 'a', { group: null, before: null })), 'b [g:c] d a');
    assert.equal(moveTask(arr, 'b', { group: null, before: { type: 'task', id: 'b' } }), arr);
});

test('moveGroup moves the group with its tasks', () => {
    assert.equal(names(moveGroup(arr, 'g', { type: 'task', id: 'b' })), '[g:ac] b d');
    assert.equal(names(moveGroup(arr, 'g', null)), 'b d [g:ac]');
});

test('putInGroup adds the tasks to the end of the group, in order', () => {
    assert.equal(names(putInGroup(arr, ['d', 'b'], 'g')), '[g:acdb]');
});

test('takeOut puts tasks just after their group, keeping their order', () => {
    assert.equal(names(takeOut(arr, ['a', 'c'])), 'b [g:] a c d');
    assert.equal(names(takeOut(arr, ['b'])), 'b [g:ac] d');   // not in a group: stays
});

test('visibleRows hides the tasks of a folded group', () => {
    assert.deepEqual(visibleRows(arr, new Set()).map((r) => r.id), ['b', 'g', 'a', 'c', 'd']);
    assert.deepEqual(visibleRows(arr, new Set(['g'])).map((r) => r.id), ['b', 'g', 'd']);
});

test('placeFromRows: where a dragged task lands', () => {
    const rows = visibleRows(arr, new Set());   // b, g, a, c, d
    const task = { type: 'task', id: 'd' };
    // gap 0: before b, in the list
    assert.deepEqual(placeFromRows(rows, 0, task), { group: null, before: { type: 'task', id: 'b' } });
    // gap 2: under the group's name, above a → into g before a
    assert.deepEqual(placeFromRows(rows, 2, task), { group: 'g', before: { type: 'task', id: 'a' } });
    // gap 4: under c (g's last task), above d: out of the group by default…
    assert.deepEqual(placeFromRows(rows, 4, task), { group: null, before: { type: 'task', id: 'd' } });
    // …or still in it when the pointer is towards the right
    assert.deepEqual(placeFromRows(rows, 4, task, true), { group: 'g', before: null });
    // end of the list
    assert.deepEqual(placeFromRows(rows, 5, task), { group: null, before: null });
    // an open group with no tasks: just under its name → into it
    const empty = visibleRows({ top: [{ type: 'group', id: 'e' }, { type: 'task', id: 'b' }], groups: { e: [] } }, new Set());
    assert.deepEqual(placeFromRows(empty, 1, task), { group: 'e', before: null });
});

test('placeFromRows: a dragged group only lands in the list', () => {
    const rows = visibleRows(arr, new Set());   // b, g, a, c, d
    const group = { type: 'group', id: 'g' };
    assert.deepEqual(placeFromRows(rows, 0, group), { group: null, before: { type: 'task', id: 'b' } });
    // a gap inside the group counts as after it
    assert.deepEqual(placeFromRows(rows, 3, group), { group: null, before: { type: 'task', id: 'd' } });
});
