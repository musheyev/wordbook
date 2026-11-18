// Addresses for the tag view (pages/TagViewPage.js), which shows a tag's
// notes and words the way a notebook shows its own:
//
//   /tag/<tag>                    the tag's list
//   /tag/<tag>/<type>/<id>        one of them open, with ⌃ ⌄ to step
//                                 through the rest
//
// Tags can hold spaces and other characters, so the tag is URL-encoded,
// the same way notebook names are (utils/notebookPaths.js).

/** The tag's list. @param {string} tag */
export const tagPath = (tag) => `/tag/${encodeURIComponent(tag)}`;

/**
 * One item open inside the tag view.
 * @param {string} tag
 * @param {{type: 'card'|'word', id: string}} item
 */
export const tagItemPath = (tag, item) => `${tagPath(tag)}/${item.type}/${encodeURIComponent(item.id)}`;

const TAG_PATH = /^\/tag\/([^/]+)/;

/** The tag in a pathname, or '' when not in the tag view. @param {string} pathname */
export const tagFromPathname = (pathname) => {
    const match = TAG_PATH.exec(pathname);
    return match ? decodeURIComponent(match[1]) : '';
};

/** Whether a pathname is one item open inside the tag view. @param {string} pathname */
export const isTagItemPathname = (pathname) => /^\/tag\/[^/]+\/(card|word)\/[^/]+/.test(pathname);

/**
 * The items carrying `tag`, from the store's allTags list, A to Z by title
 * (a tag has no order of its own).
 * @param {Array<{type: string, id: string, title: string, tags: string[]}>|null} allTags
 * @param {string} tag
 */
export const itemsWithTag = (allTags, tag) => (Array.isArray(allTags) ? allTags : [])
    .filter((it) => (it.tags || []).includes(tag))
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
