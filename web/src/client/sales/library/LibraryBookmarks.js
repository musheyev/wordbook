import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBookmarks } from '../../actions';
import BookmarkButton from '../../components/BookmarkButton';
import Spinner from '../../components/Spinner';
import { useLibrary, libraryNotePath } from './LibraryShell';

// Bookmarks, in the buyer's library: the notes the buyer starred (☆ on a
// note), newest first. Kept on the buyer's own account (api/bookmarks.js).
//
// Limited to notes of bought notebooks (on localhost your own account has
// others). The star on each row takes the bookmark off.
export default function LibraryBookmarks() {
    const dispatch = useDispatch();
    const bookmarks = useSelector((state) => state.bookmarks);
    const { products, notebooks } = useLibrary();
    const [error, setError] = useState('');

    useEffect(() => {
        dispatch(fetchBookmarks()).catch(() => setError('Couldn’t load your bookmarks. Check your connection.'));
    }, [dispatch]);

    // Which bought notebook each note is in.
    const productOf = {};
    products.forEach((product) => {
        const notebook = notebooks[product.id];
        if (notebook && notebook.status === 'ready') notebook.notes.forEach((n) => { productOf[n.id] = product; });
    });
    const stillLoading = bookmarks === null || products.some((p) => !notebooks[p.id] || notebooks[p.id].status === 'loading');
    const mine = (bookmarks || []).filter((b) => b.type === 'card' && productOf[b.id]);

    return (
        <>
            <h1 className="lib-title">Bookmarks</h1>
            {error && <p className="sales-note-error">{error}</p>}
            {stillLoading && !error ? (
                <Spinner label="Loading bookmarks…" />
            ) : mine.length === 0 ? (
                <div className="lib-empty">
                    <p>No bookmarks yet. Tap ☆ on a note to find it here again.</p>
                </div>
            ) : (
                <ul className="lib-notes">
                    {mine.map((b) => (
                        <li key={b.id} className="lib-bookmark">
                            <Link to={libraryNotePath(productOf[b.id], b.id)} className="nb-row">
                                <span className="nb-row__icon nb-row__icon--card" aria-hidden="true">
                                    <i className="sticky note outline icon"></i>
                                </span>
                                <span className="nb-row__text">
                                    <span className="nb-row__title">{b.title}</span>
                                    <span className="nb-row__sub">{productOf[b.id].title}</span>
                                </span>
                            </Link>
                            <BookmarkButton item={{ type: 'card', id: b.id, title: b.title }} />
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
