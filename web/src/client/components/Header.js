import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { logoutCurrentUser } from '../actions';

const COGNITO_LOGIN =
    'https://auth.musheye.com/login?client_id=31i8vt5m567ch5ciedmeskpk67&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile&redirect_uri=http://localhost:4000/auth';
const COGNITO_SIGNUP = COGNITO_LOGIN.replace('/login?', '/signup?');

const Header = ({ auth, logoutCurrentUser }) => {
    const navigate = useNavigate();

    const userExists = auth != null && auth !== '' && auth !== false;

    const onLogoutRequest = () => {
        // Dispatch the redux logout action, then return to the home page.
        logoutCurrentUser();
        navigate('/');
    };

    return (
        <nav>
            <div className="ui fluid inverted menu" id="menu">
                <Link to="/" className="header item">
                    make your wordbook
                </Link>

                <div className="right menu">
                    {userExists ? (
                        <>
                            <Link to="/account" className="header item">
                                <i className="book icon"></i>
                                My Wordbooks
                            </Link>

                            <span className="header item wb-user">
                                <i className="user large icon"></i>
                                {auth}
                            </span>

                            <button
                                className="ui button secondary no-padding header item"
                                onClick={onLogoutRequest}
                            >
                                <i className="sign out large icon"></i>
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <a href={COGNITO_LOGIN} className="header item">
                                <i className="sign in large icon"></i>
                                Login
                            </a>
                            <a href={COGNITO_SIGNUP} className="header item">
                                <i className="signup large icon"></i>
                                Signup
                            </a>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

function mapStateToProps({ auth }) {
    return { auth };
}

export default connect(mapStateToProps, { logoutCurrentUser })(Header);
