import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBookmarks, setBookmark } from '../actions';

// The ☆ / ★ button on a note or word (SearchResult.js): bookmark it for My
// Bookmarks, or take the bookmark off. A star, not 🔖, which already means
// the read-aloud bookmarks inside a note and "Add to notebook".
//
// The bookmarks are loaded once (state.bookmarks) and shared with My
// Bookmarks; a change shows at once and is saved on the account (offline on
// the iPhone: sent later).

/**
 * @param {object} props
 * @param {{type: 'card'|'word', id: string, title: string}} props.item
 */
export default function BookmarkButton({ item }) {
    const dispatch = useDispatch();
    const bookmarks = useSelector((state) => state.bookmarks);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (bookmarks === null) dispatch(fetchBookmarks()).catch(() => {});
    }, [bookmarks === null]);

    const on = !!bookmarks && bookmarks.some((b) => b.type === item.type && b.id === item.id);
    const toggle = () => {
        setFailed(false);
        dispatch(setBookmark(item, !on)).catch(() => {
            setFailed(true);
            setTimeout(() => setFailed(false), 3000);
        });
    };

    const label = failed ? 'Couldn’t save the bookmark. Check your connection.'
        : on ? 'Bookmarked: tap to remove from My Bookmarks' : 'Bookmark: add to My Bookmarks';
    return (
        <button type="button" className={`card-tool bookmark-btn${on ? ' bookmark-btn--on' : ''}${failed ? ' bookmark-btn--failed' : ''}`}
            title={label} aria-label={on ? 'Remove bookmark' : 'Bookmark'} aria-pressed={on} onClick={toggle}>
            <i className={`${on ? 'star' : 'star outline'} icon`} aria-hidden="true"></i>
        </button>
    );
}
