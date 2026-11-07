import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchCurrentUser, fetchItemSorts, fetchItemColors } from '../../actions';
import { sortItems, DEFAULT_ITEM_SORT } from '../../utils/itemSort';
import Spinner from '../../components/Spinner';
import NotebookQuiz from '../../components/NotebookQuiz';
import CATALOG from '../catalog';
import { boughtIds } from '../purchases';
import { fetchNotebookNotes } from '../useNotebook';

// The buyer's library: what someone who bought Spanish notebooks sees when
// they sign in (/learn-spanish/library, localhost only for now).
//
//   Spanish notebooks    My notebooks · My quizzes · Bookmarks    Buy more →
//   ────────────────────────────────────────────────────────────────────────
//   (the page: LibraryHome, LibraryNotebook, LibraryNote, …)
//
// Buyers read the seller's notebooks as they are — the seller's later
// changes reach them — and can't change them: no Edit, Delete, Add, Move or
// Share anywhere here. What they keep is their own: quizzes they save,
// bookmarks and colours (each stored on their own account).
//
// For now "the seller" is you: the notes come from your own account, and the
// notebooks count as bought once you go through the pretend checkout in this
// browser (sales/purchases.js).
//
// The shell loads every bought notebook's notes once, sorted the way the
// seller sorts them, and hands them to the pages through useLibrary().

const LibraryContext = createContext(null);

/**
 * What the library pages share:
 *   products   the bought catalog entries (sales/catalog.js)
 *   notebooks  by product id: { status: 'loading' } | { status: 'error', message }
 *              | { status: 'ready', notes }  (notes in the seller's order)
 *   findProduct(id), productFor(notebookName)  bought products only
 */
export const useLibrary = () => useContext(LibraryContext);

/** The library's address for a note of a bought notebook. */
export const libraryNotePath = (product, noteId) => `/learn-spanish/library/${product.id}/${encodeURIComponent(noteId)}`;

export default function LibraryShell() {
    const dispatch = useDispatch();
    const auth = useSelector((state) => state.auth);
    const itemSorts = useSelector((state) => state.itemSorts);
    const itemColors = useSelector((state) => state.itemColors);
    const signedIn = auth != null && auth !== '' && auth !== false;
    const { pathname } = useLocation();

    // The sales pages sit outside the app's shell (App.js), which is what
    // normally asks who's signed in.
    useEffect(() => { if (auth === null) dispatch(fetchCurrentUser()).catch(() => {}); }, []);
    useEffect(() => {
        if (!signedIn) return;
        if (itemSorts == null) dispatch(fetchItemSorts());
        if (itemColors == null) dispatch(fetchItemColors());
    }, [signedIn]);

    const products = useMemo(() => {
        const ids = boughtIds();
        return CATALOG.filter((p) => ids.includes(p.id));
    }, []);

    // Each bought notebook's notes, as the server gives them.
    const [loaded, setLoaded] = useState({});
    useEffect(() => {
        if (!signedIn) return;
        products.forEach((product) => {
            setLoaded((now) => ({ ...now, [product.id]: { status: 'loading' } }));
            dispatch(fetchNotebookNotes(product))
                .then((notes) => setLoaded((now) => ({ ...now, [product.id]: { status: 'ready', notes } })))
                .catch((err) => setLoaded((now) => ({ ...now, [product.id]: { status: 'error', message: err.message } })));
        });
    }, [signedIn, products]);

    // In the seller's order: their sort for that notebook (utils/itemSort.js).
    const notebooks = useMemo(() => {
        const out = {};
        products.forEach((product) => {
            const state = loaded[product.id] || { status: 'loading' };
            if (state.status !== 'ready') { out[product.id] = state; return; }
            const sort = (itemSorts && itemSorts[product.notebook]) || DEFAULT_ITEM_SORT;
            out[product.id] = { status: 'ready', notes: sortItems(state.notes, sort, itemColors) };
        });
        return out;
    }, [products, loaded, itemSorts, itemColors]);

    const library = useMemo(() => ({
        products,
        notebooks,
        findProduct: (id) => products.find((p) => p.id === id) || null,
        productFor: (notebookName) => products.find((p) => p.notebook === notebookName) || null,
    }), [products, notebooks]);

    let page;
    if (auth === null) {
        page = <Spinner label="Loading…" />;
    } else if (!signedIn) {
        page = (
            <div className="lib-empty">
                <h1 className="lib-title">Sign in to see your notebooks</h1>
                <p>Your Spanish notebooks are kept on your account.</p>
                <a href="/login" className="cb-btn cb-btn--accent sales-btn">Sign in</a>
            </div>
        );
    } else {
        page = <Outlet />;
    }

    const tab = ({ isActive }) => `lib-bar__tab${isActive ? ' is-active' : ''}`;
    // My notebooks stays lit inside a notebook and its notes too.
    const inQuizzesOrBookmarks = /\/library\/(quizzes|bookmarks)\b/.test(pathname);
    return (
        <LibraryContext.Provider value={library}>
            <header className="lib-bar">
                <div className="sales-wrap lib-bar__inner">
                    <Link to="/learn-spanish/library" className="lib-bar__brand">Spanish notebooks</Link>
                    <nav className="lib-bar__tabs" aria-label="Your library">
                        <NavLink to="/learn-spanish/library" className={() => tab({ isActive: !inQuizzesOrBookmarks })}>
                            My notebooks
                        </NavLink>
                        <NavLink to="/learn-spanish/library/quizzes" className={tab}>My quizzes</NavLink>
                        <NavLink to="/learn-spanish/library/bookmarks" className={tab}>Bookmarks</NavLink>
                    </nav>
                    <Link to="/learn-spanish" className="lib-bar__more">
                        Buy more<span className="lib-bar__more-long"> Spanish notebooks</span>
                        <i className="arrow right icon" aria-hidden="true"></i>
                    </Link>
                </div>
            </header>
            <main className="sales-wrap lib-main">{page}</main>
            {/* The quiz (Quiz on a notebook, or My quizzes). Its "See note"
                opens the note here, in the library, not in the app. */}
            {signedIn && (
                <NotebookQuiz notePath={(notebook, source) => {
                    const product = library.productFor(notebook);
                    return product ? libraryNotePath(product, source.id) : null;
                }} />
            )}
        </LibraryContext.Provider>
    );
}
