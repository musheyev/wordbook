import React from 'react';
import { useSelector } from 'react-redux';
import { dismissProjectsNotice } from '../offline/projectsOffline';

// The offline bar on the My Projects pages (approved sketches
// design/my-projects/offline-a.png and offline-b.png), in the same look as
// the iPhone app's offline bar (components/OfflineBar.js):
//
//   no connection         "Offline — 3 changes waiting to be sent"
//                          (or "Offline — showing the copy saved on this computer")
//   connection back        "Sending 3 changes…"                    (blue)
//   all sent               "✓ All changes saved", for a moment     (green)
//
// and under it, notices about sent changes (e.g. a newer version on another
// computer was kept), each with × to close. State: state.projectsSync
// (offline/projectsOffline.js).
export default function ProjectsOfflineBar() {
    const sync = useSelector((state) => state.projectsSync);
    if (!sync) return null;
    const { offline, count, syncing, saved, notices } = sync;
    const changes = `${count} change${count === 1 ? '' : 's'}`;

    let bar = null;
    if (offline) {
        bar = { tone: '', icon: 'wifi', text: count ? `Offline — ${changes} waiting to be sent` : 'Offline — showing the copy saved on this computer' };
    } else if (syncing && count) {
        bar = { tone: ' offline-bar--sending', icon: 'sync alternate', text: `Sending ${changes}…` };
    } else if (saved) {
        bar = { tone: ' offline-bar--saved', icon: 'check', text: 'All changes saved' };
    }

    return (
        <div className="projects-offline">
            {bar && (
                <div className={`offline-bar${bar.tone}`} role="status">
                    <i className={`${bar.icon} icon`} aria-hidden="true"></i>
                    {bar.text}
                </div>
            )}
            {notices.map((n) => (
                <div key={n.id} className="offline-notice" role="status">
                    <span>{n.text}</span>
                    <button type="button" aria-label="Close" onClick={() => dismissProjectsNotice(n.id)}>×</button>
                </div>
            ))}
        </div>
    );
}
