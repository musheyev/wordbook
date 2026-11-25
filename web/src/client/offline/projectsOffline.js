// My Projects offline (myremembrancer.com on a computer; decided).
//
// Three jobs:
//   1. A copy: every time the projects change in the app (loaded, or
//      changed by you), they're saved in this browser (IndexedDB, the "meta"
//      store of offline/db.js, key "projects:copy"). With no connection the
//      page shows that copy. All projects, automatically (decided).
//   2. An outbox: a change made with no connection is shown at once (the
//      actions apply it to the copy) and kept here, in order
//      ("projects:outbox"). Several edits of one task become one.
//   3. Sending: when the connection is back, the outbox is sent, oldest
//      first. Each change says when it was made (`changedAt`); if the server
//      has a newer version (changed on another computer meanwhile), the
//      newer one is kept, the latest change wins (decided), and a notice
//      says so. A change the server refuses is dropped, with a notice. With
//      no answer at all, sending stops and is tried again later. When the
//      outbox is empty, the projects are loaded fresh.
//
// Deleting a whole project needs a connection (decided); everything else
// works offline.
//
// The page reads the state from the store (state.projectsSync):
//   { offline, count, syncing, saved, pending: [task ids], notices: [{ id, text }] }
//
// For testing in a browser, from the developer console:
//   projectsOfflineTest.offline()   act as if there's no connection
//   projectsOfflineTest.online()    connection back (sends the outbox)
import { dbGet, dbPut, dbDelete } from './db';
import { isNativeApp } from '../native/platform';
import { site } from '../utils/site';

export const PROJECTS_SYNC = 'projects_sync';
const COPY_KEY = 'projects:copy';
const OUTBOX_KEY = 'projects:outbox';
const TEST_KEY = 'projects-offline-test';
const RETRY_MS = 20000;
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

let store = null;
let api = null;
let refresh = () => Promise.resolve();
let outbox = [];
let offlineSeen = false;       // a request failed for want of a connection
let syncing = false;
let saved = false;             // "All changes saved", for a moment
let savedTimer = null;
let notices = [];
let retryTimer = null;

/** Only on myremembrancer.com, on the website (the iPhone app has no My Projects). */
export const projectsOfflineWanted = () => site.projects && !isNativeApp();

const testOffline = () => { try { return localStorage.getItem(TEST_KEY) === '1'; } catch (e) { return false; } };

/** No connection now (as far as we know). */
export const isProjectsOffline = () => testOffline() || (typeof navigator !== 'undefined' && navigator.onLine === false) || offlineSeen;

/** Changes waiting to be sent. */
export const hasPendingProjectChanges = () => outbox.length > 0;

/** Tasks with a change waiting (the amber dot). */
const pendingTasks = () => [...new Set(outbox.map((op) => op.taskId).filter(Boolean))];

function publish() {
    if (!store) return;
    store.dispatch({
        type: PROJECTS_SYNC,
        payload: { offline: isProjectsOffline(), count: outbox.length, syncing, saved, pending: pendingTasks(), notices: [...notices] },
    });
}

function notice(text) {
    notices = [...notices, { id: `${Date.now()}-${Math.random()}`, text }];
}

/** Close a notice (its ×). */
export function dismissProjectsNotice(id) {
    notices = notices.filter((n) => n.id !== id);
    publish();
}

const persistOutbox = () => dbPut('meta', OUTBOX_KEY, { ops: outbox }).catch(() => {});

/** A request failed for want of a connection: we're offline until one gets through. */
export function goneOffline() {
    if (offlineSeen) return;
    offlineSeen = true;
    publish();
    scheduleRetry();
}

function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { syncProjects().catch(() => {}); }, RETRY_MS);
}

/** The copy saved in this browser ({ projects, tasks, groups, holidays, layout }), or null. */
export async function savedProjectsCopy() {
    const record = await dbGet('meta', COPY_KEY).catch(() => null);
    return record && record.data ? record.data : null;
}

/**
 * Keep a change for later. `op`: { kind, projectId?, taskId?, groupId?,
 * body, label }. Edits of the same task (or the same project's order, or a
 * group's colour, or holidays, or the layout) replace the waiting one: only
 * the last counts.
 */
export function queueProjectChange(op) {
    const sameAs = (a) => (
        (op.kind === 'updateTask' && a.kind === 'updateTask' && a.taskId === op.taskId)
        || (op.kind === 'arrange' && a.kind === 'arrange' && a.projectId === op.projectId)
        || (op.kind === 'groupColor' && a.kind === 'groupColor' && a.groupId === op.groupId)
        || ((op.kind === 'holidays' || op.kind === 'layout') && a.kind === op.kind)
    );
    outbox = [...outbox.filter((a) => !sameAs(a)), { ...op, at: new Date().toISOString() }];
    saved = false;
    persistOutbox();
    publish();
    if (!isProjectsOffline()) syncProjects().catch(() => {});
}

const pid = (id) => encodeURIComponent(id);

/** Send one change. */
function send(op) {
    const p = `/projects/${pid(op.projectId || '')}`;
    switch (op.kind) {
        case 'createProject': return api.post('/projects', op.body, JSON_HEADERS);
        case 'renameProject': return api.put(p, op.body, JSON_HEADERS);
        case 'createTask': return api.post(`${p}/tasks`, op.body, JSON_HEADERS);
        case 'updateTask': return api.put(`${p}/tasks/${pid(op.taskId)}`, op.body, JSON_HEADERS);
        case 'deleteTask': return api.delete(`${p}/tasks/${pid(op.taskId)}`, { data: op.body, ...JSON_HEADERS });
        case 'createGroup': return api.post(`${p}/groups`, op.body, JSON_HEADERS);
        case 'renameGroup':
        case 'groupColor': return api.put(`${p}/groups/${pid(op.groupId)}`, op.body, JSON_HEADERS);
        case 'ungroup': return api.delete(`${p}/groups/${pid(op.groupId)}`);
        case 'arrange': return api.put(`${p}/arrange`, op.body, JSON_HEADERS);
        case 'holidays': return api.put('/projects/holidays', op.body, JSON_HEADERS);
        case 'layout': return api.put('/projects/layout', op.body, JSON_HEADERS);
        default: return Promise.resolve({ data: {} });
    }
}

/** What the server kept, in words, when it wasn't your change. */
function keptNotice(op, data) {
    if (!data || data.kept !== 'theirs') return;
    if (op.kind === 'updateTask') notice(`“${data.name || op.label}” was changed elsewhere after your offline edit, so that version was kept.`);
    else if (op.kind === 'deleteTask') notice(`“${op.label}” was changed elsewhere after you deleted it offline, so it was kept.`);
    else if (op.kind === 'renameProject' || op.kind === 'renameGroup') notice(`“${op.label}” was renamed elsewhere after your offline change, so that name was kept.`);
    else if (op.kind === 'groupColor') notice(`“${op.label}” was changed elsewhere after your offline change, so its colour wasn't changed.`);
}

/**
 * Send the outbox, oldest first. Stops (and tries again later) when there's
 * no connection; when it's empty, loads the projects fresh.
 */
export async function syncProjects() {
    if (!api || syncing || testOffline()) return;
    if (!outbox.length) {
        if (offlineSeen) {
            // Nothing to send: just see whether the connection is back.
            try { await refresh(); offlineSeen = false; publish(); } catch (err) { scheduleRetry(); }
        }
        return;
    }
    syncing = true;
    publish();
    let stopped = false;
    while (outbox.length) {
        const op = outbox[0];
        try {
            const res = await send(op);
            offlineSeen = false;
            keptNotice(op, res && res.data);
        } catch (err) {
            if (!err.response) { offlineSeen = true; stopped = true; break; }
            const said = err.response.data && err.response.data.error;
            if (err.response.status === 404) notice(`“${op.label}” was deleted elsewhere, so your offline change to it was dropped.`);
            else notice(`An offline change couldn’t be saved (${op.label}): ${said || 'the server refused it'}.`);
        }
        outbox = outbox.slice(1);
        persistOutbox();
        publish();
    }
    syncing = false;
    if (stopped) {
        publish();
        scheduleRetry();
        return;
    }
    await refresh().catch(() => {});
    saved = true;
    publish();
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { saved = false; publish(); }, 4000);
}

/** Forget the copy and the outbox (signing out: they belong to the account). */
export async function forgetProjectsOffline() {
    outbox = [];
    notices = [];
    await Promise.all([dbDelete('meta', COPY_KEY), dbDelete('meta', OUTBOX_KEY)]).catch(() => {});
    publish();
}

/**
 * Start-up (main.jsx). `refreshProjects`: loads the projects from the server
 * (actions: fetchProjects), used once the outbox is sent.
 */
export async function installProjectsOffline(theStore, theApi, refreshProjects) {
    if (!projectsOfflineWanted() || typeof indexedDB === 'undefined') return;
    store = theStore;
    api = theApi;
    refresh = refreshProjects;
    const record = await dbGet('meta', OUTBOX_KEY).catch(() => null);
    outbox = (record && record.ops) || [];

    // Keep the copy up to date (a moment after each change).
    let last = null;
    let timer = null;
    store.subscribe(() => {
        const data = store.getState().projects;
        if (!data || data === last) return;
        last = data;
        clearTimeout(timer);
        timer = setTimeout(() => { dbPut('meta', COPY_KEY, { data, at: new Date().toISOString() }).catch(() => {}); }, 300);
    });

    window.addEventListener('online', () => { offlineSeen = false; publish(); syncProjects().catch(() => {}); });
    window.addEventListener('offline', () => publish());
    window.projectsOfflineTest = {
        offline: () => { try { localStorage.setItem(TEST_KEY, '1'); } catch (e) { /* */ } publish(); },
        online: () => { try { localStorage.removeItem(TEST_KEY); } catch (e) { /* */ } offlineSeen = false; publish(); return syncProjects(); },
    };
    publish();
    if (outbox.length && !isProjectsOffline()) syncProjects().catch(() => {});
}
