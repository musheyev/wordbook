// Opening bookmarks (My Bookmarks, and the note's "Previous / Next" bar when
// it was opened from there; pages/BookmarksPage.js, pages/WordbookPage.js).
//
// A bookmark names a note or word, not a notebook (a note can be in several),
// so opening one finds a notebook that has it, the open one first, the same
// way a note link does (actions: findNoteLinkNotebook). "?from=bookmarks" on
// the note's address tells its page to show the bookmarks bar instead of the
// notebook's, and keeps it there after a refresh.
import { findNoteLinkNotebook } from '../actions';
import { itemPath } from './notebookPaths';
import { noteLinkHref } from './noteLinks';

export const FROM_BOOKMARKS = 'bookmarks';

/** Whether a page's ?query says it was opened from My Bookmarks. */
export const openedFromBookmarks = (search) => new URLSearchParams(search).get('from') === FROM_BOOKMARKS;

/**
 * Where a bookmark opens: the note or word in a notebook that has it, marked
 * as opened from My Bookmarks. A word no notebook has any more opens on its
 * own page (definitions and your note); a note in none gives null.
 *
 * @param {Function} dispatch
 * @param {{type: 'card'|'word', id: string}} item
 * @returns {Promise<string|null>}
 */
export async function bookmarkPath(dispatch, item) {
    const notebook = await dispatch(findNoteLinkNotebook(item));
    if (notebook) return `${itemPath(notebook, item)}?from=${FROM_BOOKMARKS}`;
    if (item.type === 'word') return noteLinkHref('word', item.id);
    return null;
}
