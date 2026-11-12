// URL helpers for notebooks. A notebook opens on its item list; each item has
// its own URL so the browser/phone back button returns to the list.
//
// The address says what kind of book it is: a notebook (My Notebooks) lives
// under /notebook/, a wordbook (My Wordbooks) under /wordbook/. Otherwise
// they're the same page (pages/WordbookPage.js):
//   /notebook/<name>                 -> item list
//   /notebook/<name>/card/<card_id>  -> one note
//   /notebook/<name>/word/<word>     -> one dictionary word
//   /wordbook/<name>/…               -> the same, for a wordbook
//
// Both prefixes open either kind, so old links (everything used to be
// /wordbook/…) and links made before the kinds were known still work; the
// page then swaps the address for the right one (WordbookPage,
// correctPrefix).
//
// Why a module variable for the kinds: links are built in many places,
// most of which don't read the store. main.jsx keeps this copy of the
// store's `wordbookKinds` up to date (rememberNotebookKinds), so
// notebookPath(name) can pick the prefix without every caller passing the
// kinds in.

const WORDBOOK = 'wordbook';
const NOTEBOOK = 'notebook';

// { [name]: "wordbook" | "notebook" }, or null until the list has loaded.
let knownKinds = null;

/**
 * Keep the kinds notebookPath uses in step with the store (main.jsx calls
 * this whenever the store changes).
 * @param {Object<string, string>|null} kinds the store's wordbookKinds
 */
export function rememberNotebookKinds(kinds) {
    knownKinds = kinds;
}

/**
 * The address prefix for a notebook: "wordbook" for a wordbook, otherwise
 * "notebook" (also while the kinds haven't loaded: most books are notebooks).
 * @param {string} name
 * @param {Object<string, string>|null} [kinds] defaults to the remembered ones
 * @returns {'wordbook'|'notebook'}
 */
export const prefixFor = (name, kinds = knownKinds) =>
    (kinds && kinds[name] === 'wordbook' ? WORDBOOK : NOTEBOOK);

export const notebookPath = (name, kinds) => `/${prefixFor(name, kinds)}/${encodeURIComponent(name)}`;

export const itemPath = (name, item, kinds) =>
    `${notebookPath(name, kinds)}/${item.type}/${encodeURIComponent(item.id)}`;

// Matches either prefix. Both are 8 letters long, which NotebookMenu's rename
// relies on (it keeps the rest of the address after the prefix and name).
const BOOK_PATH = /^\/(?:wordbook|notebook)\/([^/]+)/;

// Whether a pathname is one item inside a notebook (a note or a word).
export const isItemPathname = (pathname) => /^\/(?:wordbook|notebook)\/[^/]+\/(card|word)\/[^/]+/.test(pathname);

// The notebook name in a pathname, or '' when not inside a notebook.
export const notebookFromPathname = (pathname) => {
    const match = BOOK_PATH.exec(pathname);
    return match ? decodeURIComponent(match[1]) : '';
};

/**
 * The same address with the prefix this notebook should have, or null when
 * it already has it (or the kinds aren't known yet, so we can't tell).
 * Used by WordbookPage to move /wordbook/Work to /notebook/Work.
 * @param {string} pathname e.g. "/wordbook/Work/card/abc"
 * @param {Object<string, string>|null} kinds the store's wordbookKinds
 * @returns {string|null}
 */
export function correctPrefix(pathname, kinds) {
    const name = notebookFromPathname(pathname);
    if (!name || !kinds) return null;
    const want = prefixFor(name, kinds);
    if (pathname.startsWith(`/${want}/`)) return null;
    return `/${want}/${pathname.slice(WORDBOOK.length + 2)}`;
}

// The list a notebook belongs to: My Wordbooks for a wordbook, My Notebooks
// for everything else (also while kinds haven't loaded: `kinds` is null).
export const WORDBOOKS_PATH = '/wordbooks';
export const NOTEBOOKS_PATH = '/account';
export const listPathFor = (name, kinds) =>
    (kinds && kinds[name] === 'wordbook' ? WORDBOOKS_PATH : NOTEBOOKS_PATH);
