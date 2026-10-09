import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { connect } from 'react-redux';
import Header from './components/Header';
import NoteWindows from './components/NoteWindows';
import PlayerPanel from './components/PlayerPanel';
import { fetchCurrentUser, fetchInbox } from './actions';
import { preloadRichTextEditor } from './components/LazyRichTextEditor';

// The card editor is now rendered in place inside the detail pane (see
// CardEditorInline), not as a global modal.
const App = ({ auth, fetchCurrentUser, fetchInbox }) => {
    // Previously loaded on the server via react-router-config's loadData.
    // As a client-side SPA we fetch the current user once on mount.
    useEffect(() => {
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    // Stop mobile keyboards from auto-capitalizing the first letter in any text
    // box. Applied globally (once, plus a MutationObserver for fields mounted
    // later) so every input, textarea and rich-text editor is covered without
    // annotating each one. A field can still opt in by setting its own
    // autocapitalize attribute.
    useEffect(() => {
        const SELECTOR = 'input, textarea, [contenteditable="true"]';
        const set = (el) => {
            if (el.matches && el.matches(SELECTOR) && !el.hasAttribute('autocapitalize')) {
                el.setAttribute('autocapitalize', 'none');
            }
        };
        const scan = (root) => {
            set(root);
            if (root.querySelectorAll) root.querySelectorAll(SELECTOR).forEach(set);
        };
        scan(document.body);
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) scan(node);
                });
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    // Logged out has no nav rail / bottom tab bar (see Header), so the shell
    // runs full-width.
    const loggedIn = auth != null && auth !== '' && auth !== false;

    // Signed in: fetch the note editor in the background once the page is
    // idle, so the first Edit doesn't wait for it (LazyRichTextEditor).
    useEffect(() => {
        if (loggedIn) preloadRichTextEditor();
    }, [loggedIn]);

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
            {/* Floating note windows (desktop) render above everything. */}
            <NoteWindows />
            <PlayerPanel />
        </div>
    );
};

function mapStateToProps({ auth }) {
    return { auth };
}

export default connect(mapStateToProps, { fetchCurrentUser, fetchInbox })(App);
