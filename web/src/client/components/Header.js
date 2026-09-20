import React from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { connect } from 'react-redux';
import { logoutCurrentUser, openCardEditor } from '../actions';
import WordList from './WordList';

const COGNITO_LOGIN =
    'https://auth.musheye.com/login?client_id=31i8vt5m567ch5ciedmeskpk67&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile&redirect_uri=http://localhost:4000/auth';
const COGNITO_SIGNUP = COGNITO_LOGIN.replace('/login?', '/signup?');

const navClass = ({ isActive }) => `nav-item${isActive ? ' on' : ''}`;

// Cardbook navigation. A left rail on desktop, a bottom tab bar on mobile.
// Inside a cardbook the rail becomes contextual (desktop only): back link,
// cardbook name, add-card, and the card list — so there is a single left panel.
const Header = ({ auth, logoutCurrentUser, openCardEditor }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const userExists = auth != null && auth !== '' && auth !== false;

    const inCardbook = location.pathname.startsWith('/wordbook/');
    const cardbookName = inCardbook
        ? decodeURIComponent(location.pathname.slice('/wordbook/'.length))
        : '';

    const onLogoutRequest = () => {
        if (window.confirm('Log out of Cardbook?')) {
            logoutCurrentUser();
            navigate('/');
        }
    };

    return (
        <nav className={`nav-rail${inCardbook ? ' nav-rail--ctx' : ''}`}>
            <Link to="/" className="nav-brand">
                <i className="book icon"></i>
                Cardbook
            </Link>

            {inCardbook && userExists && (
                <div className="nav-ctx">
                    <div className="nav-ctx__head">
                        <span className="nav-ctx__title" title={cardbookName}>{cardbookName}</span>
                        <button type="button" className="nav-ctx__add" title="New card"
                            onClick={() => openCardEditor({ mode: 'create', wordbook: cardbookName })}>
                            <i className="plus icon"></i>
                        </button>
                    </div>
                    <div className="nav-ctx__label">Cards</div>
                    <div className="nav-ctx__list">
                        <WordList wordbook={cardbookName} />
                    </div>
                </div>
            )}

            <div className="nav-items">
                <NavLink to="/" end className={navClass}>
                    <i className="search icon"></i>
                    <span className="nav-label">Words</span>
                </NavLink>

                {userExists && (
                    <NavLink to="/account" className={navClass}>
                        <i className="clone outline icon"></i>
                        <span className="nav-label">My Cardbooks</span>
                    </NavLink>
                )}

                <div className="nav-spacer" />

                {userExists ? (
                    <>
                        <span className="nav-user">
                            <i className="user circle icon"></i>
                            <span className="nav-label">{auth}</span>
                        </span>
                        <button type="button" className="nav-item nav-logout" onClick={onLogoutRequest}>
                            <i className="sign out icon"></i>
                            <span className="nav-label">Log out</span>
                        </button>
                    </>
                ) : (
                    <>
                        <a className="nav-item" href={COGNITO_LOGIN}>
                            <i className="sign in icon"></i>
                            <span className="nav-label">Login</span>
                        </a>
                        <a className="nav-item" href={COGNITO_SIGNUP}>
                            <i className="edit outline icon"></i>
                            <span className="nav-label">Sign up</span>
                        </a>
                    </>
                )}
            </div>
        </nav>
    );
};

function mapStateToProps({ auth }) {
    return { auth };
}

export default connect(mapStateToProps, { logoutCurrentUser, openCardEditor })(Header);
