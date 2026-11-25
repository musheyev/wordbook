import React from 'react';
import { COLOR_CHOICES } from '../utils/projectColors';

// A row of colours to choose from, in My Projects (a task's window and a
// group's ⋯ menu). The first choice is "no colour of its own": the task or
// group then shows the colour it would have anyway (its group's or its
// project's), which `auto` gives so the choice can show it.
//
//   (● Same as project)  ● ● ● ● ● ● ● ●
//
// The chosen one has a ring. Only the colour's name ("teal") is passed on;
// utils/projectColors.js has the shades.

/**
 * @param {object} props
 * @param {string|null} props.value the chosen colour's name, or null for none of its own
 * @param {(key: string|null) => void} props.onChange
 * @param {{hex: string, label: string}} props.auto what "none of its own" looks like, and its words
 * @param {string} [props.className]
 */
export default function ColorSwatches({ value, onChange, auto, className = '' }) {
    return (
        <span className={`cswatches ${className}`} role="radiogroup" aria-label="Colour">
            <button type="button" role="radio" aria-checked={!value}
                className={`cswatches__auto${!value ? ' cswatches__auto--on' : ''}`} onClick={() => onChange(null)}>
                <span className="cswatches__dot" style={{ background: auto.hex }} aria-hidden="true" />
                {auto.label}
            </button>
            {COLOR_CHOICES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={value === c.key} aria-label={c.label} title={c.label}
                    className={`cswatches__swatch${value === c.key ? ' cswatches__swatch--on' : ''}`}
                    style={{ background: c.hex, color: c.hex }} onClick={() => onChange(c.key)} />
            ))}
        </span>
    );
}
