import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { connect } from 'react-redux';
import Header from './components/Header';
import { fetchCurrentUser } from './actions';

// The card editor is now rendered in place inside the detail pane (see
// CardEditorInline), not as a global modal.
const App = ({ fetchCurrentUser }) => {
    // Previously loaded on the server via react-router-config's loadData.
    // As a client-side SPA we fetch the current user once on mount.
    useEffect(() => {
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    return (
        <div className="app-shell">
            <Header />
            <main className="app-main">
                <Outlet />
            </main>
        </div>
    );
};

export default connect(null, { fetchCurrentUser })(App);
