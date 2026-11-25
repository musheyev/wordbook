import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { saveHolidays } from '../actions';

// Holidays for My Projects: days skipped like weekends in every project
// (decided: one list for all projects). Opened by "Holidays" on the
// projects pages.
//
//   Holidays                                              ✕
//   Skipped like weekends in all your projects.
//   Thu, Nov 26, 2026   Thanksgiving                       ×
//   Fri, Dec 25, 2026   Christmas                          ×
//   [ date ] [ name (optional) ]   [+ Add]
//
// Each add or remove is saved at once (actions: saveHolidays), and the
// charts move their tasks right away.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-12-25" → "Fri, Dec 25, 2026". */
function longDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${DAYS[wd]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * @param {Array<{date, name}>} props.holidays the list now
 * @param {() => void} props.onClose
 */
export default function ProjectHolidays({ holidays, onClose }) {
    const dispatch = useDispatch();
    const [date, setDate] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const save = (list) => {
        setError('');
        return dispatch(saveHolidays(list)).catch((err) => setError(err.message));
    };
    const add = (e) => {
        e.preventDefault();
        if (!date) return;
        save([...holidays.filter((h) => h.date !== date), { date, name: name.trim() }]
            .sort((a, b) => a.date.localeCompare(b.date)));
        setDate('');
        setName('');
    };
    const weekendNote = (() => {
        if (!date) return '';
        const [y, m, d] = date.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        return wd === 0 || wd === 6 ? 'That’s a weekend already.' : '';
    })();

    return createPortal(
        <div className="cb-dialog__overlay" onMouseDown={onClose}>
            <div className="cb-dialog holidays" role="dialog" aria-modal="true" aria-label="Holidays" onMouseDown={(e) => e.stopPropagation()}>
                <div className="holidays__head">
                    <h3 className="cb-dialog__title">Holidays</h3>
                    <button type="button" className="ptw__close" aria-label="Close" onClick={onClose}><i className="close icon" aria-hidden="true"></i></button>
                </div>
                <p className="cb-dialog__msg">Skipped like weekends in all your projects: tasks don’t count them, and later tasks move past them.</p>
                {holidays.length === 0 ? (
                    <div className="holidays__empty">No holidays yet.</div>
                ) : (
                    <ul className="holidays__list">
                        {holidays.map((h) => (
                            <li key={h.date} className="holidays__row">
                                <span className="holidays__date">{longDate(h.date)}</span>
                                <span className="holidays__name">{h.name}</span>
                                <button type="button" className="ptw__x" aria-label={`Remove ${h.name || longDate(h.date)}`}
                                    onClick={() => save(holidays.filter((x) => x.date !== h.date))}>×</button>
                            </li>
                        ))}
                    </ul>
                )}
                <form className="holidays__add" onSubmit={add}>
                    <input type="date" className="ptw__input" value={date} aria-label="Holiday date" onChange={(e) => setDate(e.target.value)} />
                    <input className="ptw__input holidays__nameinput" value={name} maxLength={80} placeholder="Name (optional)"
                        aria-label="Holiday name" onChange={(e) => setName(e.target.value)} />
                    <button type="submit" className="cb-btn cb-btn--accent" disabled={!date}>+ Add</button>
                </form>
                {weekendNote && <div className="holidays__hint">{weekendNote}</div>}
                {error && <div className="cb-sheet__error" role="alert">{error}</div>}
                <div className="cb-dialog__actions">
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
