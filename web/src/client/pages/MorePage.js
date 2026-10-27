import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import ConfirmDialog from '../components/ConfirmDialog';
import { logoutCurrentUser } from '../actions';

// More (/more), the last tab of the phone's bottom bar. The bar has room for
// five tabs, so the links used less often live here: Tags, My Quizzes and
// Admin (both admins only; the /admin hub lists the admin pages), and the
// account with Log out.
// On desktop the side panel shows these directly and has no More link.

function MorePage({ auth, isAdmin, logoutCurrentUser }) {
    const navigate = useNavigate();
    const [confirmingLogout, setConfirmingLogout] = React.useState(false);

    const onLogoutConfirmed = () => {
        setConfirmingLogout(false);
        logoutCurrentUser();
        navigate('/');
    };

    const rows = [
        { to: '/tags', icon: 'tags', label: 'Tags', hint: 'Everything you tagged, by tag' },
        ...(isAdmin ? [{ to: '/quizzes', icon: 'question circle outline', label: 'My Quizzes', hint: 'Quizzes you saved' }] : []),
        ...(isAdmin ? [{ to: '/admin', icon: 'shield alternate', label: 'Admin', hint: 'Users, images, audio clean-up' }] : []),
    ];

    return (
        <div className="admin-page">
            <div className="admin-page__head">
                <h1 className="cb-page-title">More</h1>
            </div>
            <ul className="admin-hub">
                {rows.map((row) => (
                    <li key={row.to}>
                        <Link className="admin-hub__row" to={row.to}>
                            <i className={`${row.icon} icon admin-hub__icon`} aria-hidden="true"></i>
                            <span className="admin-hub__text">
                                <span className="admin-hub__label">{row.label}</span>
                                <span className="admin-hub__hint">{row.hint}</span>
                            </span>
                            <i className="chevron right icon admin-hub__chev" aria-hidden="true"></i>
                        </Link>
                    </li>
                ))}
                <li>
                    <button type="button" className="admin-hub__row more-logout"
                        onClick={() => setConfirmingLogout(true)}>
                        <i className="sign out icon admin-hub__icon" aria-hidden="true"></i>
                        <span className="admin-hub__text">
                            <span className="admin-hub__label">Log out</span>
                            <span className="admin-hub__hint">Signed in as {auth}</span>
                        </span>
                    </button>
                </li>
            </ul>

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
        </div>
    );
}

function mapStateToProps({ auth, isAdmin }) {
    return { auth, isAdmin };
}

export default connect(mapStateToProps, { logoutCurrentUser })(requireAuth(MorePage));
