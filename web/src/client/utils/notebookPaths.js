// URL helpers for notebooks. A notebook opens on its item list; each item has
// its own URL so the browser/phone back button returns to the list.
//   /wordbook/<name>                 -> item list
//   /wordbook/<name>/card/<card_id>  -> one note
//   /wordbook/<name>/word/<word>     -> one dictionary word

export const notebookPath = (name) => `/wordbook/${encodeURIComponent(name)}`;

export const itemPath = (name, item) =>
    `${notebookPath(name)}/${item.type}/${encodeURIComponent(item.id)}`;

// Whether a pathname is one item inside a notebook (a note or a word).
export const isItemPathname = (pathname) => /^\/wordbook\/[^/]+\/(card|word)\/[^/]+/.test(pathname);

// The notebook name in a pathname, or '' when not inside a notebook.
export const notebookFromPathname = (pathname) => {
    const match = /^\/wordbook\/([^/]+)/.exec(pathname);
    return match ? decodeURIComponent(match[1]) : '';
};

// The list a notebook belongs to: My Wordbooks for a wordbook, My Notebooks
// for everything else (also while kinds haven't loaded: `kinds` is null).
export const WORDBOOKS_PATH = '/wordbooks';
export const NOTEBOOKS_PATH = '/account';
export const listPathFor = (name, kinds) =>
    (kinds && kinds[name] === 'wordbook' ? WORDBOOKS_PATH : NOTEBOOKS_PATH);
