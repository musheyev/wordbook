// Tests for the My Projects date math (projectSchedule.js).
// Run with:  npm test   (in web/; uses Node's built-in test runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    toDay, fromDay, weekday, nextWorkday, endDay, schedule, movesWith, startsAfterDeleting, makesLoop, span,
} from './projectSchedule.js';

// 16 Nov 2026 is a Monday.
const MON = '2026-11-16';

test('day numbers go both ways and know the weekday', () => {
    assert.equal(fromDay(toDay(MON)), MON);
    assert.equal(weekday(toDay(MON)), 1);
    assert.equal(weekday(toDay('2026-11-22')), 0); // Sunday
    assert.equal(fromDay(toDay('2027-01-01')), '2027-01-01');
});

test('a weekend start moves to Monday', () => {
    assert.equal(fromDay(nextWorkday(toDay('2026-11-21'))), '2026-11-23'); // Sat → Mon
    assert.equal(fromDay(nextWorkday(toDay('2026-11-22'))), '2026-11-23'); // Sun → Mon
    assert.equal(fromDay(nextWorkday(toDay(MON))), MON);
});

test('days count only workdays', () => {
    assert.equal(fromDay(endDay(toDay(MON), 1)), MON);
    assert.equal(fromDay(endDay(toDay(MON), 5)), '2026-11-20');           // Mon–Fri
    assert.equal(fromDay(endDay(toDay('2026-11-19'), 5)), '2026-11-25');  // Thu → next Wed
    assert.equal(fromDay(endDay(toDay(MON), 10)), '2026-11-27');          // two weeks
});

test('a task starts the workday after what it waits for ends', () => {
    const placed = schedule([
        { id: 'plan', days: 5, after: [], start: MON },
        { id: 'pick', days: 3, after: ['plan'] },
    ]);
    assert.deepEqual(placed.get('plan'), { start: MON, end: '2026-11-20' });
    assert.deepEqual(placed.get('pick'), { start: '2026-11-23', end: '2026-11-25' });
});

test('waiting for two tasks: starts after the later one', () => {
    const placed = schedule([
        { id: 'a', days: 2, after: [], start: MON },
        { id: 'b', days: 8, after: [], start: MON },
        { id: 'c', days: 1, after: ['a', 'b'] },
    ]);
    assert.equal(placed.get('b').end, '2026-11-25');
    assert.equal(placed.get('c').start, '2026-11-26');
});

test('order in the list does not matter', () => {
    const placed = schedule([
        { id: 'c', days: 1, after: ['b'] },
        { id: 'b', days: 1, after: ['a'] },
        { id: 'a', days: 1, after: [], start: MON },
    ]);
    assert.equal(placed.get('c').start, '2026-11-18');
});

test('a longer task moves everything after it', () => {
    const tasks = [
        { id: 'a', days: 5, after: [], start: MON },
        { id: 'b', days: 2, after: ['a'] },
        { id: 'c', days: 2, after: ['b'] },
    ];
    const before = schedule(tasks).get('c').start;
    tasks[0].days = 7;
    const after = schedule(tasks).get('c').start;
    assert.equal(before, '2026-11-25');
    assert.equal(after, '2026-11-27');
});

test('a missing "waits for" task is skipped; a loop does not hang', () => {
    const placed = schedule([
        { id: 'a', days: 1, after: ['gone'], start: MON },
        { id: 'x', days: 1, after: ['y'] },
        { id: 'y', days: 1, after: ['x'] },
    ], { today: MON });
    assert.equal(placed.get('a').start, MON);
    assert.ok(placed.get('x') && placed.get('y'));
});

test('movesWith finds every task after, directly or not', () => {
    const tasks = [
        { id: 'plan', after: [] },
        { id: 'demo', after: ['plan'] },
        { id: 'pick', after: ['plan'] },
        { id: 'order', after: ['pick'] },
        { id: 'plumb', after: ['demo'] },
        { id: 'install', after: ['order', 'plumb'] },
        { id: 'paint', after: ['install'] },
    ];
    assert.deepEqual(movesWith(tasks, 'order'), ['install', 'paint']);
    assert.deepEqual(movesWith(tasks, 'paint'), []);
    assert.equal(movesWith(tasks, 'plan').length, 6);
});

test('deleting a task: those that waited only for it keep their start', () => {
    const tasks = [
        { id: 'a', days: 5, after: [], start: MON },
        { id: 'b', days: 2, after: ['a'] },
        { id: 'c', days: 1, after: [], start: MON },
        { id: 'd', days: 1, after: ['a', 'c'] },
    ];
    // b waits only for a; d still has c after a is gone.
    assert.deepEqual(startsAfterDeleting(tasks, 'a'), { b: '2026-11-23' });
});

test('makesLoop spots a task waiting for itself, directly or not', () => {
    const tasks = [
        { id: 'a', after: [] },
        { id: 'b', after: ['a'] },
        { id: 'c', after: ['b'] },
    ];
    assert.equal(makesLoop(tasks, 'a', ['c']), true);
    assert.equal(makesLoop(tasks, 'a', ['a']), true);
    assert.equal(makesLoop(tasks, 'c', ['a']), false);
});

test('span is the first start and last end', () => {
    const placed = schedule([
        { id: 'a', days: 5, after: [], start: MON },
        { id: 'b', days: 2, after: ['a'] },
    ]);
    assert.deepEqual(span(placed, ['a', 'b']), { start: MON, end: '2026-11-24' });
    assert.equal(span(placed, []), null);
});
