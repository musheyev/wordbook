import React from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { connect } from 'react-redux';
import { logoutCurrentUser } from '../actions';
import WordList from './WordList';
import ConfirmDialog from './ConfirmDialog';
import NotebookMenu from './NotebookMenu';
import AddItemSheet from './AddItemSheet';
import { COGNITO_LOGIN, COGNITO_SIGNUP } from '../utils/cognito';
import { notebookFromPathname } from '../utils/notebookPaths';

const navClass = ({ isActive }) => `nav-item${isActive ? ' on' : ''}`;

// Cardbook navigation. A left rail on desktop, a bottom tab bar on mobile.
// Inside a cardbook the rail becomes contextual (desktop only): notebook
// menu, add, and the item list — so there is a single left panel.
const Header = ({ auth, isAdmin, logoutCurrentUser }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const userExists = auth != null && auth !== '' && auth !== false;

    const cardbookName = notebookFromPathname(location.pathname);
    const inCardbook = cardbookName !== '';

    const [confirmingLogout, setConfirmingLogout] = React.useState(false);
    const [addOpen, setAddOpen] = React.useState(false);

    const onLogoutConfirmed = () => {
        setConfirmingLogout(false);
        logoutCurrentUser();
        navigate('/');
    };

    // Before login there is no nav: the landing page carries the brand and the
    // sign-up / log-in actions, so the rail (and mobile tab bar) is hidden.
    if (!userExists) {
        return null;
    }

    return (
        <nav className={`nav-rail${inCardbook ? ' nav-rail--ctx' : ''}`}>
            <Link to="/" className="nav-brand">
                <i className="book icon"></i>
                Remembrancer
            </Link>

            {inCardbook && userExists && (
                <div className="nav-ctx">
                    <div className="nav-ctx__head">
                        <NotebookMenu name={cardbookName} className="nb-menu--rail" />
                        <button type="button" className="nav-ctx__add" title="Add a word or note"
                            aria-label="Add a word or note" onClick={() => setAddOpen(true)}>
                            <i className="plus icon"></i>
                        </button>
                    </div>
                    <div className="nav-ctx__label">Notes</div>
                    <div className="nav-ctx__list">
                        <WordList wordbook={cardbookName} />
                    </div>
                    <AddItemSheet open={addOpen} wordbook={cardbookName} onClose={() => setAddOpen(false)} />
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
                        <span className="nav-label">My Notebooks</span>
                    </NavLink>
                )}

                {userExists && isAdmin && (
                    <NavLink to="/users" className={navClass}>
                        <i className="users icon"></i>
                        <span className="nav-label">Users</span>
                    </NavLink>
                )}

                <div className="nav-spacer" />

                {userExists ? (
                    <>
                        <span className="nav-user">
                            <i className="user circle icon"></i>
                            <span className="nav-label">{auth}</span>
                        </span>
                        <button type="button" className="nav-item nav-logout"
                            onClick={() => setConfirmingLogout(true)}>
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

            <ConfirmDialog
                open={confirmingLogout}
                title="Log out?"
                message="You'll need to sign in again to open your notebooks."
                confirmLabel="Log out"
                cancelLabel="Cancel"
                tone="accent"
                onConfirm={onLogoutConfirmed}
                onCancel={() => setConfirmingLogout(false)}
            />
        </nav>
    );
};

function mapStateToProps({ auth, isAdmin }) {
    return { auth, isAdmin };
}

export default connect(mapStateToProps, { logoutCurrentUser })(Header);
