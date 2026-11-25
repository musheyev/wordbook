// The site's service worker (myremembrancer.com only; registered by
// client/utils/serviceWorker.js). It lets the site open with no internet
// connection, so My Projects can be used offline (decided: it must open
// even when the page is started or reloaded offline).
//
// What a service worker is: a small script the browser keeps running beside
// the site. Every request the page makes passes through it first, so it can
// answer from a copy saved on the computer (the browser's "Cache Storage")
// when the network can't.
//
// What it does here:
//   install    saves this build's code and styles (PRECACHE, filled in at
//              build time by the plugin in vite.config.js) and the page itself
//   pages      (opening any address of the site) the network first, so a new
//              deploy is seen at once; with no connection, the saved page
//   /assets/   (code, styles, fonts, images; their names change with every
//              build, so a saved copy is never stale) the saved copy first,
//              else the network, saving what comes back
//   /api/…     never touched: data offline is the app's job (IndexedDB),
//              not this file's
//
// A new deploy makes a new sw.js (its VERSION changes). The browser notices
// on the next visit, installs it, and it takes over right away. The two
// newest saved builds are kept, so a page still open on the old build can
// load the code it asks for; older ones are deleted.
//
// Turning it off: deploy a sw.js that unregisters itself, or (on one
// computer) localStorage "no-service-worker" = "1" and reload
// (client/utils/serviceWorker.js unregisters it).

const VERSION = '__VERSION__';
const PRECACHE = '__PRECACHE__';
const CACHE = `site-${VERSION}`;
// Saved copies are found by their address alone. (A page asks for its code
// with extra headers, e.g. Origin for module scripts; a copy saved without
// them would otherwise not count as a match, and offline the page would get
// nothing.)
const MATCH = { ignoreVary: true, ignoreSearch: true };

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(PRECACHE);
        // Take over without waiting for every tab of the old build to close.
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Cache names end with the build time, so they sort oldest first.
        const builds = (await caches.keys()).filter((name) => name.startsWith('site-')).sort();
        const keep = new Set([...builds.slice(-2), CACHE]);
        await Promise.all(builds.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    // Opening a page: the network first; offline, the saved page (the site
    // is one page, index.html, for every address).
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(async () => (await caches.match('/index.html', MATCH)) || Response.error()));
        return;
    }

    // Code, styles, fonts, images: the saved copy, else the network (saved for next time).
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith((async () => {
            const saved = await caches.match(url.pathname, MATCH);
            if (saved) return saved;
            const response = await fetch(request);
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
        })());
    }
});
