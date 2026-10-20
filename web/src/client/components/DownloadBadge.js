import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { isCovered, isItemAvailable, notebookStatus } from '../offline/registry';

// Small pieces of the offline features (offline/), used across the screens.
// They all read the Redux copy of offline state (reducers/offlineReducer.js),
// so they redraw when something is downloaded, removed, or the connection
// changes. With offline features off (the website) they show nothing.

/** The offline state: { enabled, online, registry, progress }. */
export const useOffline = () => useSelector((state) => state.offline);

/** True when offline features are on and there's no connection. */
export const useIsOffline = () => {
    const offline = useOffline();
    return offline.enabled && !offline.online;
};

/**
 * The small ↓ that marks something downloaded: filled for a whole notebook or
 * a downloaded note, outlined for a notebook with only some notes downloaded.
 *
 * @param {{ status: 'full'|'partial'|null, className?: string }} props
 */
export function DownloadBadge({ status, className = '' }) {
    if (!status) return null;
    const label = status === 'full' ? 'Downloaded' : 'Some notes downloaded';
    return (
        <i className={`arrow alternate circle down${status === 'partial' ? ' outline' : ''} icon download-badge ${className}`}
            title={label} aria-label={label} role="img"></i>
    );
}

/** A notebook's badge (nothing on the website, or when nothing's downloaded). */
export function NotebookBadge({ name, className }) {
    const offline = useOffline();
    const progress = offline.progress[`notebook:${name}`];
    if (!offline.enabled || (progress && !progress.error)) return null; // not until it's done
    return <DownloadBadge status={notebookStatus(offline.registry, name)} className={className} />;
}

/**
 * A note's or word's badge in a notebook list: shown when it's downloaded —
 * on its own or with another notebook it's in. (Not in a downloaded notebook:
 * everything there is, and the notebook's badge already says so.)
 */
export function ItemBadge({ notebook, item }) {
    const offline = useOffline();
    if (!offline.enabled) return null;
    const key = `${item.type}:${item.id}`;
    // Changed offline, not yet sent (offline/outbox.js).
    if (offline.outbox.pending.includes(key)) {
        return (
            <i className="sync alternate icon download-badge download-badge--item download-badge--pending"
                title="Changed offline — waiting to be sent" aria-label="Waiting to be sent" role="img"></i>
        );
    }
    if (offline.registry.notebooks[notebook]) return null;
    return isCovered(key, offline.registry)
        ? <DownloadBadge status="full" className="download-badge--item" /> : null;
}

/**
 * A notebook's items as they can be shown now: with no connection, only the
 * downloaded ones; `missing` describes the rest for the "N more aren't
 * downloaded" line (null when nothing's missing).
 *
 * @param {string} notebook
 * @param {object[]} items
 * @returns {{ items: object[], missing: string|null }}
 */
export function useAvailableItems(notebook, items) {
    const offline = useOffline();
    return useMemo(() => {
        if (!offline.enabled || offline.online) return { items, missing: null };
        const available = items.filter((item) => isItemAvailable(offline.registry, notebook, `${item.type}:${item.id}`));
        const rest = items.filter((item) => !available.includes(item));
        if (!rest.length) return { items: available, missing: null };
        const notes = rest.filter((item) => item.type === 'card').length;
        const noun = notes === rest.length ? (rest.length === 1 ? 'note' : 'notes')
            : notes === 0 ? (rest.length === 1 ? 'word' : 'words') : 'items';
        const verb = rest.length === 1 ? 'isn’t' : 'aren’t';
        const count = available.length ? `${rest.length} more` : String(rest.length);
        return {
            items: available,
            missing: `${count} ${noun} ${verb} downloaded. Connect to the internet to see ${rest.length === 1 ? 'it' : 'them'}.`,
        };
    }, [offline.enabled, offline.online, offline.registry, notebook, items]);
}

/** The "N more notes aren't downloaded" line under an offline notebook. */
export function MissingLine({ text }) {
    if (!text) return null;
    return (
        <div className="offline-missing">
            <i className="cloud icon" aria-hidden="true"></i>{text}
        </div>
    );
}
