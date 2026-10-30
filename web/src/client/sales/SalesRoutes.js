import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import PlayerPanel from '../components/PlayerPanel';
import SalesPage from './SalesPage';
import CheckoutPage from './CheckoutPage';
import NotFoundPage from '../pages/NotFoundPage';
import './sales.css';

// The Spanish sales page and its checkout, under /learn-spanish:
//
//   /learn-spanish                    the sales page (SalesPage)
//   /learn-spanish/checkout/<id>      pretend-Square checkout (CheckoutPage)
//
// LOCALHOST ONLY for now: routes.jsx adds these addresses only when the site
// runs with `npm run dev`, so this code isn't in the website or iPhone app
// build at all, and its styles (sales.css) aren't either.
//
// These are marketing pages, so they sit outside the app's shell (App.js):
// no side panel or tab bar. PlayerPanel is added here so the free sample
// notes' Play button gets the usual read-aloud controls.
export default function SalesRoutes() {
    // A new page starts at the top (the browser keeps the scroll position
    // when only the address changes).
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

    return (
        <div className="sales">
            <Routes>
                <Route index element={<SalesPage />} />
                <Route path="checkout/:id" element={<CheckoutPage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <PlayerPanel />
        </div>
    );
}
