// Two websites, one app. makeyourwordbook.com and myremembrancer.com serve
// the same build, the same server and the same accounts and data; only the
// emphasis differs:
//
//   wordbook      makeyourwordbook.com  "Make Your Wordbook"  words first:
//                                        home is the Words search
//   remembrancer  myremembrancer.com    "Remembrancer"        notes first:
//                                        home is My Notebooks
//
// Which one this page is comes from the address it was opened at. The
// iPhone app is Remembrancer. Anything else (localhost while developing)
// is the wordbook site, unless `?site=remembrancer` (or `?site=wordbook`)
// was added to the address once: that choice is remembered in this browser,
// so both sites can be tried on localhost.
import { isNativeApp } from '../native/platform';

const SITES = {
    wordbook: {
        key: 'wordbook',
        name: 'Make Your Wordbook',
        icon: 'book',
        // The side panel's links, in order (components/Header.js). On
        // phones only Words, Wordbooks, Notebooks and Inbox are tabs (in this
        // order); the rest are on the More page.
        nav: ['words', 'wordbooks', 'notebooks', 'tags', 'inbox', 'classrooms', 'bookmarks', 'projects', 'quizzes'],
        wordsPath: '/',
        homePath: '/',
        // The address people write to, shown on /support and /privacy.
        email: 'makeyourwordbook@gmail.com',
        domain: 'makeyourwordbook.com',
        // My Projects (pages/ProjectsPage.js) is on Remembrancer only.
        projects: false,
    },
    remembrancer: {
        key: 'remembrancer',
        name: 'Remembrancer',
        icon: 'bookmark',
        // The user's own collections first, then Words and Inbox (decided
        // 2026-11-25); the phone's tabs stay Notebooks, Wordbooks, Words,
        // Inbox. My Projects shows here only (`projects` below).
        nav: ['notebooks', 'wordbooks', 'bookmarks', 'tags', 'quizzes', 'words', 'inbox', 'projects', 'classrooms'],
        wordsPath: '/words',
        homePath: '/account',
        // One inbox for both sites (each keeps its own setting, so they can
        // be split later).
        email: 'makeyourwordbook@gmail.com',
        domain: 'myremembrancer.com',
        // My Projects: here only, and only on a computer (never in the
        // iPhone app or on phones; utils/computerOnly.js).
        projects: true,
    },
};

const OVERRIDE_KEY = 'siteOverride';

// While developing (localhost only): ?site=… picks a site and remembers it.
function devOverride() {
    if (typeof window === 'undefined') return null;
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return null;
    try {
        const asked = new URLSearchParams(window.location.search).get('site');
        if (asked && SITES[asked]) window.localStorage.setItem(OVERRIDE_KEY, asked);
        const saved = window.localStorage.getItem(OVERRIDE_KEY);
        return SITES[saved] ? saved : null;
    } catch (e) {
        return null;
    }
}

function detect() {
    if (isNativeApp()) return SITES.remembrancer;
    const override = devOverride();
    if (override) return SITES[override];
    const host = (typeof window !== 'undefined' && window.location.hostname) || '';
    return host.includes('remembrancer') ? SITES.remembrancer : SITES.wordbook;
}

/**
 * This site: { key, name, icon, nav, wordsPath, homePath, email, domain, projects }.
 * Decided once, when the page loads.
 */
export const site = detect();

/** True on myremembrancer.com (and in the iPhone app). */
export const isRemembrancer = site.key === 'remembrancer';

// The browser tab shows the site's name.
if (typeof document !== 'undefined') document.title = site.name;
