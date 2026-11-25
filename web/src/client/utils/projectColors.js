/**
 * Colours in My Projects.
 *
 * Each project gets a colour from its place in the list, and its bars show it.
 * A group or a single task can be given a colour of its own; the server only
 * stores the colour's name ("teal"), and this file turns names into shades.
 *
 * Which colour a task's bar shows, first one that's set wins:
 *   1. the task's own colour
 *   2. its group's colour
 *   3. its project's colour
 */

/** The choices, in the order the swatches show them. Names match api/projects.js COLORS. */
export const COLOR_CHOICES = [
    { key: 'blue', hex: '#2563eb', label: 'Blue' },
    { key: 'green', hex: '#16a34a', label: 'Green' },
    { key: 'amber', hex: '#d97706', label: 'Amber' },
    { key: 'purple', hex: '#7c3aed', label: 'Purple' },
    { key: 'pink', hex: '#db2777', label: 'Pink' },
    { key: 'teal', hex: '#0891b2', label: 'Teal' },
    { key: 'olive', hex: '#4d7c0f', label: 'Olive' },
    { key: 'red', hex: '#b91c1c', label: 'Red' },
];

const HEX = new Map(COLOR_CHOICES.map((c) => [c.key, c.hex]));

/** "teal" → "#0891b2"; anything else (null, unknown) → null. */
export const colorHex = (key) => (key && HEX.get(key)) || null;

/** A project's colour, from its place in the list (the 9th starts again at blue). */
export const projectColor = (index) => COLOR_CHOICES[index % COLOR_CHOICES.length].hex;

/**
 * The colour a task's bar shows.
 *
 * @param {{color?: string|null}} task
 * @param {{color?: string|null}|null} group the task's group, if it's in one
 * @param {string} projectHex its project's colour
 * @returns {string} a hex colour
 */
export const taskColor = (task, group, projectHex) => colorHex(task && task.color) || colorHex(group && group.color) || projectHex;
