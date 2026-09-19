import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { logoutCurrentUser } from '../actions';

const COGNITO_LOGIN =
    'https://auth.musheye.com/login?client_id=31i8vt5m567ch5ciedmeskpk67&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile&redirect_uri=http://localhost:4000/auth';
const COGNITO_SIGNUP = COGNITO_LOGIN.replace('/login?', '/signup?');

const navClass = ({ isActive }) => `nav-item${isActive ? ' on' : ''}`;

// Cardbook navigation: a left rail on desktop, a bottom tab bar on mobile.
const Header = ({ auth, logoutCurrentUser }) => {
    const navigate = useNavigate();

    const userExists = auth != null && auth !== '' && auth !== false;

    const onLogoutRequest = () => {
        logoutCurrentUser();
        navigate('/');
    };

    return (
        <nav className="nav-rail">
            <Link to="/" className="nav-brand">
                <i className="book icon"></i>
                Cardbook
            </Link>

            <div className="nav-items">
                <NavLink to="/" end className={navClass}>
                    <i className="search icon"></i>
                    <span className="nav-label">Search</span>
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

export default connect(mapStateToProps, { logoutCurrentUser })(Header);
