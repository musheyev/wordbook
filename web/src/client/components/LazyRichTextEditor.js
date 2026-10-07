import React, { Suspense, lazy } from 'react';
import Spinner from './Spinner';

// The rich text editor (TipTap, math, markdown) is the biggest part of the
// app, and only needed while writing. So it isn't part of the first download:
// it loads the first time an editor opens. To make that first Edit instant
// anyway, it also downloads quietly once the page has finished loading and
// is idle — unless the device asks to save data.
const loadEditor = () => import('./RichTextEditor');
const RichTextEditor = lazy(loadEditor);

export function preloadRichTextEditor() {
    const saveData = typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData;
    if (saveData) return;
    const start = () => { loadEditor().catch(() => { /* it loads on demand instead */ }); };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(start, { timeout: 10000 });
    } else {
        setTimeout(start, 3000);
    }
}

export default function LazyRichTextEditor(props) {
    return (
        <Suspense fallback={<Spinner label="Loading editor…" />}>
            <RichTextEditor {...props} />
        </Suspense>
    );
}
