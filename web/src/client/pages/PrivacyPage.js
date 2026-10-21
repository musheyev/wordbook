import React from 'react';
import { Link } from 'react-router-dom';
import { site } from '../utils/site';

// The privacy policy, at /privacy on both websites and in the iPhone app.
// Apple requires one for every app (linked in App Store Connect and from
// inside the app); it's also good practice for the websites.
//
// It describes what the app really does, so it must change when the app
// does: what's collected (sign-up, notes, history), where it goes (AWS
// hosting, Google read-aloud, dictionary and picture services), what stays on
// the phone (offline downloads), and how deletion works (Delete account: 7
// days, then removed; api/account.js). The App Store "privacy label" answers
// must match it. Each site shows its own name and email (utils/site.js).
const UPDATED = 'October 21, 2026';

export default function PrivacyPage() {
    const mail = <a href={`mailto:${site.email}`}>{site.email}</a>;
    return (
        <article className="legal-page">
            <h1>Privacy policy</h1>
            <p className="legal-page__updated">Last updated {UPDATED}</p>

            <p>
                This policy explains what {site.name} keeps about you and why. It covers the websites
                makeyourwordbook.com and myremembrancer.com and the Remembrancer iPhone app, which are one service
                with the same accounts. In short: we keep what you put in so the app can show it back to you, we don’t
                sell it, show ads, or track you, and you can delete your account at any time.
            </p>

            <h2>Who we are</h2>
            <p>
                {site.name} is run by Rudy Musheyev, an individual developer. Questions about this policy: {mail}.
            </p>

            <h2>What we keep</h2>
            <ul>
                <li>
                    <strong>Your account:</strong> a username, your email address and a password. Sign-in is handled by
                    Amazon Cognito; we never see or store your password.
                </li>
                <li>
                    <strong>What you create:</strong> your notebooks, notes and the words in them, notes on words,
                    tags, colors, sort orders, pictures you add to notes or words, and the read-aloud settings in your
                    notes.
                </li>
                <li>
                    <strong>What you look up:</strong> your recent word searches (shown as your search history) and the
                    dictionary sources you rate.
                </li>
                <li>
                    <strong>What you share:</strong> when you share a note, word or notebook with someone, they receive
                    a copy and see your username.
                </li>
                <li>
                    <strong>Server records:</strong> our servers log requests (such as which page or feature was used,
                    and when) to keep the service working and secure. These logs are deleted after 30 days.
                </li>
            </ul>

            <h2>What stays on your device</h2>
            <ul>
                <li>
                    <strong>Websites:</strong> two cookies that keep you signed in. No advertising or analytics
                    cookies.
                </li>
                <li>
                    <strong>iPhone app:</strong> your sign-in is kept in the iPhone’s Keychain. Notebooks and notes you
                    download for offline use (their text, pictures and read-aloud audio), and changes made offline
                    until they’re sent, are stored on the phone. Remove download, Remove all downloads, logging out or
                    deleting the app removes them.
                </li>
                <li>Some preferences, like your chosen voices and reading speeds, are remembered on the device.</li>
            </ul>

            <h2>How we use it</h2>
            <p>
                Only to run the service for you: to show you your notebooks and notes, look up words, read text aloud,
                share what you choose to share, keep your account secure, and send emails you need, such as a
                sign-up code or a password reset (sent by Amazon Cognito). We don’t use your information for
                advertising, and we don’t sell it or rent it to anyone.
            </p>

            <h2>Services that help us</h2>
            <p>These companies process data on our behalf, only to provide the features below:</p>
            <ul>
                <li>
                    <strong>Amazon Web Services</strong> (United States): hosting, storage, sign-in and email codes.
                    Everything you keep in your account is stored here.
                </li>
                <li>
                    <strong>Google Cloud Text-to-Speech:</strong> the text you play aloud is sent to Google to create
                    the audio. The audio is stored so the same text doesn’t need to be created again.
                </li>
                <li>
                    <strong>Wordnik and Google Translate:</strong> the words you look up, to show definitions and
                    translations.
                </li>
                <li><strong>Brave Search:</strong> the words you look up, to find pictures for them.</li>
            </ul>
            <p>These services receive the text or word only, not your username or email address.</p>

            <h2>What we don’t do</h2>
            <ul>
                <li>No ads, and no selling or renting of your information.</li>
                <li>No tracking you across other apps or websites, and no analytics services.</li>
                <li>
                    We don’t read your notes, not for support and not even if you ask us to. There’s no reason for us to:
                    everything works without anyone looking at them.
                </li>
            </ul>

            <h2>Deleting your account</h2>
            <p>
                You can delete your account at any time: in My Notebooks, under Account, choose Delete account. To
                make sure it’s really you, you’ll sign in again with your password. Your account is then deleted
                7 days later; until then you can sign in and keep it. When it’s deleted, everything listed under
                “What we keep” is removed, and your sign-in is removed from Amazon Cognito. We don’t keep backups of
                your data, so this can’t be undone. Pictures and stored read-aloud audio are removed when we next clean up
                stored files, once nothing uses them. Copies of notes you shared with others stay with them.
            </p>

            <h2>Keeping your data safe</h2>
            <p>
                All connections use encryption (HTTPS). Sign-in uses Amazon Cognito; the website keeps your sign-in in
                cookies that page scripts can’t read, and the iPhone app keeps it in the Keychain.
            </p>

            <h2>Children</h2>
            <p>
                The service isn’t meant for children under 13, and we don’t knowingly keep information about them. If
                you believe a child under 13 has an account, write to {mail} and we’ll delete it.
            </p>

            <h2>Your choices</h2>
            <p>
                You can see, change and delete what you’ve created at any time in the app. For a copy of your data, or
                any question about it, write to {mail}.
            </p>

            <h2>Changes to this policy</h2>
            <p>
                If we change how we handle your information, we’ll update this page and the date at the top. For
                important changes, we’ll also tell you in the app.
            </p>

            <p className="legal-page__links">
                <Link to="/support">Support</Link>
            </p>
        </article>
    );
}
