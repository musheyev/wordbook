import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { connect } from 'react-redux';
import Header from './components/Header';
import { fetchCurrentUser } from './actions';

const App = ({ fetchCurrentUser }) => {
    // Previously loaded on the server via react-router-config's loadData.
    // As a client-side SPA we fetch the current user once on mount.
    useEffect(() => {
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    return (
        <div>
            <Header />
            <Outlet />
        </div>
    );
};

export default connect(null, { fetchCurrentUser })(App);
