import React from 'react';
import LegalLinks from './LegalLinks';
import { Link } from 'react-router-dom';
import { COGNITO_LOGIN, COGNITO_SIGNUP } from '../utils/cognito';
import { site, isRemembrancer } from '../utils/site';

// Shown when the main area would otherwise be empty: to logged-out visitors
// (as a what-is-this-site intro, since search needs an account), and to
// signed-in users who have no current word and no search history yet.
// Each site (utils/site.js) leads with its own strength: words on Make Your
// Wordbook, notes on Remembrancer.

const LOOK_UP = { icon: 'search', title: 'Look up', text: 'Definitions and images from real dictionaries.' };
const NOTES = { icon: 'sticky note outline', title: 'Create notes', text: 'Rich text with links, code, lists, and math.' };
const ORGANIZE = { icon: 'clone outline', title: 'Organize', text: 'Group into notebooks; reuse a note in many.' };
const FEATURES = isRemembrancer ? [NOTES, ORGANIZE, LOOK_UP] : [LOOK_UP, NOTES, ORGANIZE];

const TITLE = isRemembrancer ? 'Write it down. Remember it.' : 'Look it up. Make it yours.';
const SUB = isRemembrancer
    ? 'Write rich notes, listen to them read aloud, and keep them organized into notebooks — with a dictionary at hand for any word.'
    : 'Search any word for definitions and images, save the ones you like, and write your own rich notes — all organized into notebooks.';

const Landing = ({ loggedIn = false }) => (
    <div className="cb-landing">
        <div className="cb-landing__hero">
            <span className="cb-landing__eyebrow">
                <i className={`${site.icon} icon`}></i>{site.name}
            </span>
            <h1 className="cb-landing__title">
                {loggedIn ? `Welcome to ${site.name}` : TITLE}
            </h1>
            <p className="cb-landing__sub">
                {loggedIn
                    ? 'Search a word above to get started, or open your notebooks.'
                    : SUB}
            </p>
        </div>

        <div className="cb-landing__features">
            {FEATURES.map((f) => (
                <div className="cb-landing__feature" key={f.title}>
                    <i className={`${f.icon} icon`}></i>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                </div>
            ))}
        </div>

        {!loggedIn && (
            <div className="cb-landing__preview">
                <div className="cb-landing__pv">
                    <div className="cb-landing__pv-cap">Word result</div>
                    <div className="cb-landing__pv-body">
                        <div className="cb-landing__pv-title">serendipity</div>
                        <div className="cb-landing__pv-text">
                            The occurrence of events by chance in a happy or beneficial way.
                        </div>
                    </div>
                </div>
                <div className="cb-landing__pv">
                    <div className="cb-landing__pv-cap">Your note</div>
                    <div className="cb-landing__pv-body">
                        <div className="cb-landing__pv-card">
                            <div className="cb-landing__pv-title">Forward Flow</div>
                            <div className="cb-landing__pv-text">
                                A funding arrangement where a lender sells future loans to a buyer…
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="cb-landing__cta">
            {loggedIn ? (
                <Link to="/account" className="cb-btn cb-btn--accent">My Notebooks</Link>
            ) : (
                <>
                    <span>Save words and build your notebooks.</span>
                    <a className="cb-btn cb-btn--accent" href={COGNITO_SIGNUP}>Sign up free</a>
                    <a className="cb-btn cb-btn--ghost" href={COGNITO_LOGIN}>Log in</a>
                </>
            )}
        </div>
        <LegalLinks className="cb-landing__legal" />
    </div>
);

export default Landing;
