import React, { useEffect } from 'react';

// Drag handle on the right edge of the left rail. Writes the width to a CSS
// variable (--nav-rail-w) and localStorage, so it persists per viewer. Desktop
// only — the handle is hidden on mobile, where the rail is a bottom tab bar.
const KEY = 'nav-rail-w';
const MIN = 180;
const MAX = 520;
const DEFAULT = 212;

const clamp = (v) => Math.max(MIN, Math.min(MAX, v));
const apply = (px) => document.documentElement.style.setProperty('--nav-rail-w', `${px}px`);

export default function NavRailResizer() {
    // Restore the saved width on mount.
    useEffect(() => {
        try {
            const saved = parseInt(localStorage.getItem(KEY), 10);
            if (saved) apply(clamp(saved));
        } catch (e) { /* ignore */ }
    }, []);

    const onPointerDown = (e) => {
        e.preventDefault();
        const rail = e.currentTarget.closest('.nav-rail');
        const startX = e.clientX;
        const startW = rail ? rail.offsetWidth : DEFAULT;
        const onMove = (ev) => apply(clamp(startW + (ev.clientX - startX)));
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            try {
                const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-rail-w'), 10);
                if (w) localStorage.setItem(KEY, String(w));
            } catch (e) { /* ignore */ }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const reset = () => {
        apply(DEFAULT);
        try { localStorage.setItem(KEY, String(DEFAULT)); } catch (e) { /* ignore */ }
    };

    return (
        <div className="nav-rail__resizer" onPointerDown={onPointerDown} onDoubleClick={reset}
            role="separator" aria-orientation="vertical" title="Drag to resize (double-click to reset)" />
    );
}
