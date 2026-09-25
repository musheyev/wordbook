// URL helpers for notebooks. A notebook opens on its item list; each item has
// its own URL so the browser/phone back button returns to the list.
//   /wordbook/<name>                 -> item list
//   /wordbook/<name>/card/<card_id>  -> one note
//   /wordbook/<name>/word/<word>     -> one dictionary word

export const notebookPath = (name) => `/wordbook/${encodeURIComponent(name)}`;

export const itemPath = (name, item) =>
    `${notebookPath(name)}/${item.type}/${encodeURIComponent(item.id)}`;

// The notebook name in a pathname, or '' when not inside a notebook.
export const notebookFromPathname = (pathname) => {
    const match = /^\/wordbook\/([^/]+)/.exec(pathname);
    return match ? decodeURIComponent(match[1]) : '';
};
