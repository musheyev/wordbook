import { OFFLINE_STATE } from '../offline/downloads';

// Offline features as the screens see them (offline/downloads.js keeps it
// up to date):
//   enabled   offline features are on (the iPhone app; offline/network.js)
//   online    there's a connection
//   registry  what's downloaded (offline/registry.js)
//   progress  downloads under way, or failed: { [target]: { done, total, error? } }
//             target is "notebook:<name>", or "items" for notes downloaded one by one
//   outbox    changes made offline, waiting to be sent (offline/outbox.js):
//             { count, pending: [item keys], syncing }
//   notices   messages about sent changes: [{ id, text }]
const initial = {
    enabled: false,
    online: true,
    registry: { notebooks: {}, items: {}, lists: {} },
    progress: {},
    outbox: { count: 0, pending: [], syncing: false },
    notices: [],
};

export default function offlineReducer(state = initial, action) {
    if (action.type === OFFLINE_STATE) return { ...state, ...action.payload };
    return state;
}
