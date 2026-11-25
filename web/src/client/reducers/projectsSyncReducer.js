import { PROJECTS_SYNC } from '../offline/projectsOffline';

// My Projects offline (offline/projectsOffline.js): whether there's a
// connection, how many changes wait to be sent, whether they're being sent,
// "All changes saved" for a moment after, which tasks have a change waiting
// (the amber dot), and notices about sent changes. The page's offline bar
// (components/ProjectsOfflineBar.js) shows it.
const EMPTY = { offline: false, count: 0, syncing: false, saved: false, pending: [], notices: [] };

export default function projectsSyncReducer(state = EMPTY, action) {
    return action.type === PROJECTS_SYNC ? { ...EMPTY, ...action.payload } : state;
}
