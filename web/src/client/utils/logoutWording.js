// What the "Log out?" question says (the side panel's Log out, the phone's
// More page). Normally a plain question. With changes to My Projects still
// waiting to be sent (made offline; offline/projectsOffline.js) it warns
// first, because signing out clears them from this computer:
//
//   no connection    "3 changes to your projects haven't been sent yet, and
//                     there's no connection. If you log out now, they'll be
//                     lost."                                  [Log out anyway]
//   connection       "3 changes to your projects haven't been sent yet. Log
//                     out sends them first; any that can't be sent will be
//                     lost."                                  [Log out]
// (Log out sends them first: actions, logoutCurrentUser.)
import { useSelector } from 'react-redux';

const PLAIN = {
    message: "You'll need to sign in again to open your notebooks.",
    confirmLabel: 'Log out',
    tone: 'accent',
};

/** { message, confirmLabel, tone } for the Log out question. */
export function useLogoutWording() {
    const sync = useSelector((state) => state.projectsSync);
    const count = (sync && sync.count) || 0;
    if (!count) return PLAIN;
    const changes = count === 1 ? '1 change to your projects hasn’t' : `${count} changes to your projects haven’t`;
    if (sync.offline) {
        return {
            message: `${changes} been sent yet, and there’s no connection. If you log out now, ${count === 1 ? 'it' : 'they'}’ll be lost.`,
            confirmLabel: 'Log out anyway',
            tone: 'danger',
        };
    }
    return {
        message: `${changes} been sent yet. Log out sends ${count === 1 ? 'it' : 'them'} first; any that can’t be sent will be lost.`,
        confirmLabel: 'Log out',
        tone: 'accent',
    };
}
