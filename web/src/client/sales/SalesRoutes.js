import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import PlayerPanel from '../components/PlayerPanel';
import SalesPage from './SalesPage';
import CheckoutPage from './CheckoutPage';
import LibraryShell from './library/LibraryShell';
import LibraryHome from './library/LibraryHome';
import LibraryNotebook from './library/LibraryNotebook';
import LibraryNote from './library/LibraryNote';
import LibraryQuizzes from './library/LibraryQuizzes';
import LibraryBookmarks from './library/LibraryBookmarks';
import NotFoundPage from '../pages/NotFoundPage';
import './sales.css';

// The Spanish sales page and its checkout, under /learn-spanish:
//
//   /learn-spanish                    the sales page (SalesPage)
//   /learn-spanish/checkout/<id>      pretend-Square checkout (CheckoutPage)
//   /learn-spanish/library            the buyer's library (library/LibraryShell):
//     …/library                         My notebooks (only the bought ones)
//     …/library/<id>                    a bought notebook's notes
//     …/library/<id>/<note id>          one note, read only
//     …/library/quizzes, …/bookmarks    the buyer's own saved quizzes, bookmarks
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
                <Route path="library" element={<LibraryShell />}>
                    <Route index element={<LibraryHome />} />
                    <Route path="quizzes" element={<LibraryQuizzes />} />
                    <Route path="bookmarks" element={<LibraryBookmarks />} />
                    <Route path=":id" element={<LibraryNotebook />} />
                    <Route path=":id/:noteId" element={<LibraryNote />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <PlayerPanel />
        </div>
    );
}
