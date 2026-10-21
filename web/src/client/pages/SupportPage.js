import React from 'react';
import { Link } from 'react-router-dom';
import { site } from '../utils/site';
import { COGNITO_LOGIN } from '../utils/cognito';

// The support page, at /support on both websites and in the iPhone app.
// Apple requires a support link for every app (App Store Connect's "Support
// URL"). How to reach us, plus answers to the questions people ask most.
// Each site shows its own name and email (utils/site.js).
export default function SupportPage() {
    const mail = <a href={`mailto:${site.email}`}>{site.email}</a>;
    return (
        <article className="legal-page">
            <h1>Support</h1>
            <p>
                Need help with {site.name}, or have an idea? Write to {mail}. Please include your username and, if
                something went wrong, what you were doing and on which device. We usually reply within a few days.
            </p>

            <h2>Common questions</h2>

            <h3>I forgot my password</h3>
            <p>
                On the <a href={COGNITO_LOGIN}>sign-in page</a>, choose “Forgot your password?”. We’ll email you a code
                to set a new one.
            </p>

            <h3>How do I use notebooks offline? (iPhone app)</h3>
            <p>
                Open a notebook’s menu and choose Download, or tap the download button on a single note. Downloaded
                notebooks and notes, with their pictures and read-aloud audio, are available without a connection.
                Changes you make offline are sent when you’re back online.
            </p>

            <h3>Read-aloud doesn’t play</h3>
            <p>
                Check that your phone isn’t muted and the volume is up. Read-aloud needs a connection unless the note
                was downloaded. If it still doesn’t play, write to us with the note’s name.
            </p>

            <h3>How do I delete my account?</h3>
            <p>
                In My Notebooks, under Account, choose Delete account and sign in again with your password. Your account
                is deleted 7 days later; sign in before then if you change your mind. See
                the <Link to="/privacy">privacy policy</Link> for what is deleted.
            </p>

            <h3>Privacy</h3>
            <p>
                Read our <Link to="/privacy">privacy policy</Link> for what we keep and why. In short: no ads, no
                tracking, and your data isn’t sold.
            </p>
        </article>
    );
}
