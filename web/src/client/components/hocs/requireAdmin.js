import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Navigate } from 'react-router-dom';

// Gate a page to admins (members of the Cognito "admins" group). Superset of
// requireAuth: unknown auth shows a loader; non-admins (signed out or not in
// the group) are sent home.
export default (ChildComponent) => {
    class RequireAdmin extends Component {
        render() {
            const { auth, isAdmin } = this.props;

            if (auth === null) {
                return <div>Loading...</div>;
            }
            if (!auth || !isAdmin) {
                return <Navigate to="/" replace />;
            }
            return <ChildComponent {...this.props} />;
        }
    }

    function mapStateToProps({ auth, isAdmin }) {
        return { auth, isAdmin };
    }

    return connect(mapStateToProps)(RequireAdmin);
};
