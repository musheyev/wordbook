import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { connect } from 'react-redux';
import Header from './components/Header';
import { fetchCurrentUser, fetchInbox } from './actions';

// The card editor is now rendered in place inside the detail pane (see
// CardEditorInline), not as a global modal.
const App = ({ auth, fetchCurrentUser, fetchInbox }) => {
    // Previously loaded on the server via react-router-config's loadData.
    // As a client-side SPA we fetch the current user once on mount.
    useEffect(() => {
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    // Logged out has no nav rail / bottom tab bar (see Header), so the shell
    // runs full-width.
    const loggedIn = auth != null && auth !== '' && auth !== false;

    // Keep the Inbox badge current without a live connection: load the inbox
    // once after login, and again whenever the user comes back to this tab
    // (the browser fires "visibilitychange" when a tab is shown or hidden).
    // New shares therefore appear the next time the app is looked at.
    useEffect(() => {
        if (!loggedIn) return undefined;
        fetchInbox();
        const onVisible = () => {
            if (document.visibilityState === 'visible') fetchInbox();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [loggedIn, fetchInbox]);

    return (
        <div className={`app-shell${loggedIn ? '' : ' app-shell--norail'}`}>
            <Header />
            <main className="app-main">
                <Outlet />
            </main>
        </div>
    );
};

function mapStateToProps({ auth }) {
    return { auth };
}

export default connect(mapStateToProps, { fetchCurrentUser, fetchInbox })(App);
