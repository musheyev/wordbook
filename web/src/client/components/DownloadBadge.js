import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { isItemAvailable, notebookStatus } from '../offline/registry';

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
export function DownloadBadge({ status, className = '', title }) {
    if (!status) return null;
    if (status === 'running') {
        return <i className={`spinner loading icon download-badge ${className}`} title={title || 'Downloading…'}
            aria-label={title || 'Downloading'} role="img"></i>;
    }
    const label = title || (status === 'full' ? 'Downloaded'
        : status === 'downloading' ? 'Download not finished: it continues when you’re online'
            : 'Some notes downloaded');
    return (
        <i className={`arrow alternate circle down${status === 'full' ? '' : ' outline'} icon download-badge ${className}`}
            title={label} aria-label={label} role="img"></i>
    );
}

/**
 * What a download in progress is doing, for menus and tooltips:
 * "Downloading… 12 of 28" (the text), then "Downloading audio… 5 of 28".
 */
export function progressLabel(progress) {
    if (!progress || !progress.total) return 'Downloading…';
    return `${progress.phase === 'audio' ? 'Downloading audio…' : 'Downloading…'} ${progress.done} of ${progress.total}`;
}

/**
 * A notebook's badge (nothing on the website, or when nothing's downloaded):
 * filled ↓ when the download finished; a spinner while it runs; an outlined ↓
 * when it's interrupted (it resumes when there's a connection) or only some
 * notes are on the device.
 */
export function NotebookBadge({ name, className }) {
    const offline = useOffline();
    if (!offline.enabled) return null;
    const progress = offline.progress[`notebook:${name}`];
    if (progress && !progress.error) {
        return <DownloadBadge status="running" title={progressLabel(progress)} className={className} />;
    }
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
    // Its text is on the device (opens offline); not shown in a notebook
    // that's fully downloaded, where every item is.
    if ((offline.registry.notebooks[notebook] || {}).complete) return null;
    return (offline.registry.saved || {})[key]
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
