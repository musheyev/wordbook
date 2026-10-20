// Account deletion dates for messages: "Tuesday, October 27". The nightly
// job (api/purge-accounts.js) deletes on that day or the night after, so
// messages say "on or shortly after".
export const formatDeletionDate = (iso) => new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
});

// After Delete account the user is signed out; the start page shows the date
// once (components/PendingDeletion.js DeletionScheduledNotice). Kept for this
// browser tab only.
const NOTICE_KEY = 'account-deletion-scheduled';
export const rememberScheduledNotice = (iso) => { try { sessionStorage.setItem(NOTICE_KEY, iso); } catch (e) { /* no notice */ } };
export const takeScheduledNotice = () => {
    try { const v = sessionStorage.getItem(NOTICE_KEY); sessionStorage.removeItem(NOTICE_KEY); return v; } catch (e) { return null; }
};
