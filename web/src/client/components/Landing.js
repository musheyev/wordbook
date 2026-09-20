import React from 'react';
import { Link } from 'react-router-dom';

// Shown when the main area would otherwise be empty: to logged-out visitors
// (as a what-is-Cardbook intro, since search needs an account), and to
// signed-in users who have no current word and no search history yet.
const COGNITO_LOGIN =
    'https://auth.musheye.com/login?client_id=31i8vt5m567ch5ciedmeskpk67&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile&redirect_uri=http://localhost:4000/auth';
const COGNITO_SIGNUP = COGNITO_LOGIN.replace('/login?', '/signup?');

const FEATURES = [
    { icon: 'search', title: 'Look up', text: 'Definitions and images from real dictionaries.' },
    { icon: 'sticky note outline', title: 'Create notes', text: 'Rich text with links, code, lists, and math.' },
    { icon: 'clone outline', title: 'Organize', text: 'Group into notebooks; reuse a note in many.' },
];

const Landing = ({ loggedIn = false }) => (
    <div className="cb-landing">
        <div className="cb-landing__hero">
            <span className="cb-landing__eyebrow">
                <i className="book icon"></i>Remembrancer
            </span>
            <h1 className="cb-landing__title">
                {loggedIn ? 'Welcome to Remembrancer' : 'Look it up. Make it yours.'}
            </h1>
            <p className="cb-landing__sub">
                {loggedIn
                    ? 'Search a word above to get started, or open your notebooks.'
                    : 'Search any word for definitions and images, save the ones you like, and write your own rich notes — all organized into notebooks.'}
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
    </div>
);

export default Landing;
