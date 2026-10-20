import React from 'react';
import { useOffline } from './DownloadBadge';
import { dismissNotice } from '../offline/outbox';

// The thin bar at the top of every screen in the iPhone app:
//   no connection        "Offline — showing what's downloaded", or how many
//                        changes made offline are waiting to be sent
//   connection is back   "Sending 2 changes…" while they're sent
// and, under it, notices about sent changes (e.g. a newer version on another
// device was kept), each with × to close. See offline/outbox.js.
export default function OfflineBar() {
    const offline = useOffline();
    if (!offline.enabled) return null;
    const { count, syncing } = offline.outbox;
    const changes = `${count} change${count === 1 ? '' : 's'}`;

    let bar = null;
    if (!offline.online) {
        bar = count ? `Offline — ${changes} waiting to be sent` : 'Offline — showing what’s downloaded';
    } else if (syncing && count) {
        bar = `Sending ${changes}…`;
    }

    return (
        <>
            {bar && (
                <div className={`offline-bar${offline.online ? ' offline-bar--sending' : ''}`} role="status">
                    <i className={`${offline.online ? 'sync alternate' : 'wifi'} icon`} aria-hidden="true"></i>
                    {bar}
                </div>
            )}
            {offline.notices.map((n) => (
                <div key={n.id} className="offline-notice" role="status">
                    <span>{n.text}</span>
                    <button type="button" aria-label="Close" onClick={() => dismissNotice(n.id)}>×</button>
                </div>
            ))}
        </>
    );
}
