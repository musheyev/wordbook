// Short relative time for lists: "just now", "5m ago", "3h ago", "2d ago",
// then a date ("Sep 26") after a week, when "43d ago" stops being useful.
//
// Intl.DateTimeFormat formats the date in the viewer's own locale and time
// zone, so nothing here needs to know where the user is.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(isoString, now = Date.now()) {
    const then = new Date(isoString).getTime();
    if (Number.isNaN(then)) return '';

    const elapsed = now - then;
    if (elapsed < MINUTE) return 'just now';
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
    if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(then);
}
