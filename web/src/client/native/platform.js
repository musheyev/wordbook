// The iPhone app (mobile/, Capacitor) runs this same web app from files
// packaged inside it, at capacitor://localhost — not at
// makeyourwordbook.com. So, only inside the app, anything addressed
// relative to the site ("/api/…": server calls, images saved in notes) has
// to name the server in full. On the website nothing changes.
//
// This folder (client/native/) is the only app-aware code in the web app.

/** The website, whose server the app talks to. */
export const SITE = 'https://makeyourwordbook.com';

/** Running inside the iPhone app (Capacitor puts window.Capacitor in the page). */
export const isNativeApp = () => typeof window !== 'undefined'
    && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

/**
 * A site path ("/api/tts", "/api/images/x.png") as this page should ask for
 * it: in full inside the app, unchanged on the website (and for anything
 * that isn't a site path: full URLs, blob:, data:).
 */
export const siteUrl = (path) => (isNativeApp() && typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
    ? `${SITE}${path}` : path);
