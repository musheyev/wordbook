import React from 'react';
import { useOffline } from './DownloadBadge';
import { downloadItems, removeItemDownloads } from '../offline/downloads';

// Downloading single notes and words (offline/downloads.js), in the iPhone
// app only. Downloaded on their own, they show offline in every notebook they
// belong to; a whole notebook's download covers them already.

const keyOf = (item) => `${item.type}:${item.id}`;

/**
 * The ↓ in an open note's toolbar: Download, or Remove download once it's
 * downloaded. In a downloaded notebook it just shows that it's downloaded.
 *
 * @param {{ notebook: string, item: {type, id, title} }} props
 */
export function NoteDownloadButton({ notebook, item }) {
    const offline = useOffline();
    if (!offline.enabled || !item) return null;
    const busy = offline.progress.items && !offline.progress.items.error;
    const own = !!offline.registry.items[keyOf(item)];
    const viaNotebook = !!(notebook && offline.registry.notebooks[notebook]);

    if (viaNotebook) {
        return (
            <button type="button" className="card-tool card-tool--on" disabled title="Downloaded with the notebook"
                aria-label="Downloaded with the notebook">
                <i className="arrow alternate circle down icon"></i>
            </button>
        );
    }
    if (busy) {
        return (
            <button type="button" className="card-tool" disabled title="Downloading…" aria-label="Downloading">
                <i className="spinner loading icon"></i>
            </button>
        );
    }
    return own ? (
        <button type="button" className="card-tool card-tool--on" title="Downloaded — tap to remove this device’s copy"
            aria-label="Remove download" onClick={() => removeItemDownloads([item])}>
            <i className="arrow alternate circle down icon"></i>
        </button>
    ) : (
        <button type="button" className="card-tool" disabled={!offline.online}
            title={offline.online ? 'Download to this device' : 'Needs a connection'}
            aria-label="Download" onClick={() => downloadItems([item])}>
            <i className="arrow alternate circle down outline icon"></i>
        </button>
    );
}

/**
 * Select → Download: the ticked notes and words. If they're all already
 * downloaded one by one, it removes them instead. Hidden in a downloaded
 * notebook (everything's there already).
 *
 * @param {{ notebook: string, items: object[] }} props the ticked items
 */
export function DownloadSelectedButton({ notebook, items }) {
    const offline = useOffline();
    if (!offline.enabled || !items.length || offline.registry.notebooks[notebook]) return null;
    const busy = offline.progress.items && !offline.progress.items.error;
    const allOwn = items.every((item) => offline.registry.items[keyOf(item)]);
    if (busy) {
        const { done, total } = offline.progress.items;
        return (
            <button type="button" className="cb-btn cb-btn--ghost" disabled>
                <i className="spinner loading icon" aria-hidden="true"></i>Downloading… {done} of {total}
            </button>
        );
    }
    return allOwn ? (
        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => removeItemDownloads(items)}
            title="Removes only this device’s copies">
            <i className="arrow alternate circle down outline icon" aria-hidden="true"></i>Remove download
        </button>
    ) : (
        <button type="button" className="cb-btn cb-btn--ghost" disabled={!offline.online}
            onClick={() => downloadItems(items.filter((item) => !offline.registry.items[keyOf(item)]))}>
            <i className="arrow alternate circle down outline icon" aria-hidden="true"></i>Download
        </button>
    );
}
