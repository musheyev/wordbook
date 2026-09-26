import React from 'react';

// The drag-handle symbol: six dots in two columns (⋮⋮).
//
// Drawn as inline SVG rather than an icon-font class on purpose: the app's
// icon font (Semantic UI 2.4.1) has no "grip" icon, and an icon class that
// doesn't exist renders as nothing — which left the drag handles invisible.
// `currentColor` makes the dots take the surrounding text color, so CSS can
// recolor it like any icon.
export default function GripIcon({ size = 16 }) {
    return (
        <svg width={size * 0.625} height={size} viewBox="0 0 10 16" aria-hidden="true" focusable="false">
            {[2, 8, 14].map((y) => (
                <React.Fragment key={y}>
                    <circle cx="2.5" cy={y} r="1.5" fill="currentColor" />
                    <circle cx="7.5" cy={y} r="1.5" fill="currentColor" />
                </React.Fragment>
            ))}
        </svg>
    );
}
