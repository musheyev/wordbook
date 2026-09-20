import React, { Component } from 'react';
import { connect } from 'react-redux';
import { fetchUsers } from '../actions';
import requireAdmin from '../components/hocs/requireAdmin';

// Admin view: lists the app's users. Reached directly at /users (there is no
// nav link — it's an admin-only page). NOTE: the backend /users endpoint is not
// implemented in the monorepo API yet, so this shows the empty state until a
// route (e.g. Cognito ListUsers) is added.
class UsersListPage extends Component {
    state = { loaded: false };

    componentDidMount() {
        Promise.resolve(this.props.fetchUsers()).finally(() => this.setState({ loaded: true }));
    }

    initials(name) {
        const s = (name || '').trim();
        if (!s) return '?';
        const parts = s.split(/\s+/);
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    render() {
        const users = Array.isArray(this.props.users) ? this.props.users : [];
        const { loaded } = this.state;

        return (
            <div className="cb-users">
                <div className="cb-users__head">
                    <h1 className="cb-page-title">Users</h1>
                    {loaded && users.length > 0 && (
                        <span className="cb-users__count">{users.length} total</span>
                    )}
                </div>

                {!loaded ? (
                    <div className="cb-users__hint">Loading users…</div>
                ) : users.length === 0 ? (
                    <div className="cb-empty">No users to show.</div>
                ) : (
                    <ul className="cb-users__list">
                        {users.map((user) => (
                            <li className="cb-user" key={user.id || user.name}>
                                <span className="cb-user__avatar">{this.initials(user.name)}</span>
                                <span className="cb-user__meta">
                                    <span className="cb-user__name">{user.name || 'Unnamed user'}</span>
                                    <span className="cb-user__sub">{user.email || user.id || ''}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }
}

function mapStatetoProps(state) {
    return { users: state.users };
}

export default connect(mapStatetoProps, { fetchUsers })(requireAdmin(UsersListPage));
