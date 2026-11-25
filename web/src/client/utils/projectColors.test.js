// Tests for which colour a task's bar shows (projectColors.js).
// Run with:  npm test   (in web/; uses Node's built-in test runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_CHOICES, colorHex, projectColor, taskColor } from './projectColors.js';

test('colorHex: known names only', () => {
    assert.equal(colorHex('teal'), '#0891b2');
    assert.equal(colorHex(null), null);
    assert.equal(colorHex('gold'), null);
});

test('projectColor goes round the list', () => {
    assert.equal(projectColor(0), '#2563eb');
    assert.equal(projectColor(COLOR_CHOICES.length), '#2563eb');
});

test('taskColor: the task, then its group, then its project', () => {
    const project = '#2563eb';
    assert.equal(taskColor({ color: 'red' }, { color: 'green' }, project), '#b91c1c');
    assert.equal(taskColor({ color: null }, { color: 'green' }, project), '#16a34a');
    assert.equal(taskColor({}, null, project), project);
    assert.equal(taskColor({ color: 'gold' }, { color: null }, project), project);
});
