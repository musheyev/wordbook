import React, { Component } from 'react';
import { connect } from 'react-redux';
import { fetchAdmins } from '../actions';
import requireAdmin from '../components/hocs/requireAdmin';

// Admin-only view listing admins. Reached at /admins. NOTE: the backend /admins
// endpoint is not implemented in the monorepo API yet, so this shows the empty
// state until a route is added.
class AdminsListPage extends Component {
    state = { loaded: false };

    componentDidMount() {
        Promise.resolve(this.props.fetchAdmins()).finally(() => this.setState({ loaded: true }));
    }

    initials(name) {
        const s = (name || '').trim();
        if (!s) return '?';
        const parts = s.split(/\s+/);
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    render() {
        const admins = Array.isArray(this.props.admins) ? this.props.admins : [];
        const { loaded } = this.state;

        return (
            <div className="cb-users">
                <div className="cb-users__head">
                    <h1 className="cb-page-title">Admins</h1>
                    {loaded && admins.length > 0 && (
                        <span className="cb-users__count">{admins.length} total</span>
                    )}
                </div>

                {!loaded ? (
                    <div className="cb-users__hint">Loading admins…</div>
                ) : admins.length === 0 ? (
                    <div className="cb-empty">No admins to show.</div>
                ) : (
                    <ul className="cb-users__list">
                        {admins.map((admin) => (
                            <li className="cb-user" key={admin.id || admin.name}>
                                <span className="cb-user__avatar">{this.initials(admin.name)}</span>
                                <span className="cb-user__meta">
                                    <span className="cb-user__name">{admin.name || 'Unnamed admin'}</span>
                                    <span className="cb-user__sub">{admin.email || admin.id || ''}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }
}

function mapStatetoProps({ admins }) {
    return { admins };
}

export default connect(mapStatetoProps, { fetchAdmins })(requireAdmin(AdminsListPage));
