import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { connect } from 'react-redux';
import Header from './components/Header';
import CardEditorModal from './components/CardEditorModal';
import { fetchCurrentUser } from './actions';

const App = ({ fetchCurrentUser, cardEditorOpen, cardEditorKey }) => {
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
            {/* Keyed so the modal remounts fresh each time it opens. */}
            {cardEditorOpen && <CardEditorModal key={cardEditorKey} />}
        </div>
    );
};

function mapStateToProps({ cardEditor }) {
    return {
        cardEditorOpen: cardEditor.open,
        cardEditorKey: `${cardEditor.mode}-${cardEditor.card ? cardEditor.card.card_id : 'new'}`,
    };
}

export default connect(mapStateToProps, { fetchCurrentUser })(App);
