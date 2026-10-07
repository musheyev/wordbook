import { useEffect, useRef, useState } from 'react';

// Keeps an unsaved draft on this device until the server confirms the save,
// so slow or dropped connections, a closed tab or a crash never lose writing.
//
//   const draft = useDraft(key, current, saved);
//
//   key      what is being edited, e.g. "note:<card_id>"; null turns it off
//   current  what the editor holds now (any JSON-able value)
//   saved    what the server has (the editor's starting value)
//
// Returns:
//   restorable  a draft left over from an earlier session that differs from
//               `saved` ({ value, at }), or null; offer to restore it
//   discard()   forget that leftover draft
//   clear()     forget the draft (call once the server has saved)
//   dirty       `current` differs from `saved`
//
// While `dirty`, closing or reloading the tab asks for confirmation.
// Storage can be blocked (private windows); then drafts silently aren't kept.

const PREFIX = 'draft:';
const SAVE_DELAY_MS = 500;

const read = (key) => {
    try { const raw = localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
};
const write = (key, value) => {
    try { localStorage.setItem(PREFIX + key, JSON.stringify({ value, at: new Date().toISOString() })); } catch (e) { /* ignore */ }
};
const remove = (key) => {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function useDraft(key, current, saved) {
    const leftover = () => {
        if (!key) return null;
        const found = read(key);
        return found && !same(found.value, saved) ? found : null;
    };
    const [restorable, setRestorable] = useState(leftover);
    const dirty = Boolean(key) && !same(current, saved);
    const timer = useRef(null);

    // Editing something else (or starting to edit): look for its leftover.
    const firstKey = useRef(key);
    useEffect(() => {
        if (firstKey.current === key) return;
        firstKey.current = key;
        setRestorable(leftover());
    }, [key]);

    // Save the draft shortly after each change (and drop it when the editor
    // is back to what the server has). A leftover draft isn't overwritten
    // until the user restores or discards it.
    useEffect(() => {
        if (!key || restorable) return undefined;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => (dirty ? write(key, current) : remove(key)), SAVE_DELAY_MS);
        return () => clearTimeout(timer.current);
    }, [key, dirty, JSON.stringify(current), restorable]);

    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    return {
        restorable,
        dirty,
        discard: () => { if (key) remove(key); setRestorable(null); },
        clear: () => { clearTimeout(timer.current); if (key) remove(key); },
        takeRestorable: () => { const value = restorable && restorable.value; setRestorable(null); return value; },
    };
}
