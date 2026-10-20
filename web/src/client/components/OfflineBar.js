import React from 'react';
import { useIsOffline } from './DownloadBadge';

// The thin "Offline" bar at the top of every screen when the iPhone app has
// no connection (offline/network.js). Notebooks then show what's downloaded.
export default function OfflineBar() {
    if (!useIsOffline()) return null;
    return (
        <div className="offline-bar" role="status">
            <i className="wifi icon" aria-hidden="true"></i>
            Offline — showing what’s downloaded
        </div>
    );
}
