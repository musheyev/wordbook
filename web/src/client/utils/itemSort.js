// How a notebook's items are sorted, one choice per notebook, saved on the
// account (api/user-settings.js item_sorts; actions fetchItemSorts /
// saveItemSort). Used by the desktop overview, the left rail, the phone list,
// stepping between items, and Play all, so they all show the same order.
//
//   custom  My order: as dragged (the server's order; the only one you can drag)
//   newest  most recently added to the notebook first
//   oldest  first added first
//   az      by title, A–Z (capitals and accents ignored, 2 before 10)
//   tag     by tag, A–Z; the overview shows a heading per tag, where a note
//           with two tags appears under both, and untagged ones last
export const ITEM_SORTS = [
    { key: 'custom', label: 'My order' },
    { key: 'newest', label: 'Newest first' },
    { key: 'oldest', label: 'Oldest first' },
    { key: 'az', label: 'A–Z' },
    { key: 'tag', label: 'By tag' },
];
export const DEFAULT_ITEM_SORT = 'custom';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byTitle = (a, b) => collator.compare(a.title || '', b.title || '');

// An item's tags, A–Z.
export const sortedTags = (item) => [...(item.tags || [])].sort(collator.compare);

/**
 * The items in `sort` order (a new array; `items` is in My order). Ties keep
 * My order.
 *
 * @param {Array<{title: string, added?: string, tags?: string[]}>} items
 * @param {string} sort one of ITEM_SORTS' keys
 */
export function sortItems(items, sort) {
    const list = [...(items || [])];
    switch (sort) {
        case 'newest':
            // Items from before dates were kept have none: they go last.
            return list.sort((a, b) => (b.added || '').localeCompare(a.added || ''));
        case 'oldest':
            return list.sort((a, b) => {
                if (!a.added !== !b.added) return a.added ? 1 : -1; // undated were first
                return (a.added || '').localeCompare(b.added || '');
            });
        case 'az':
            return list.sort(byTitle);
        case 'tag':
            // By first tag (A–Z), untagged last; within a tag, by title.
            return list.sort((a, b) => {
                const ta = sortedTags(a)[0];
                const tb = sortedTags(b)[0];
                if (!ta !== !tb) return ta ? -1 : 1;
                return (ta && tb ? collator.compare(ta, tb) : 0) || byTitle(a, b);
            });
        default:
            return list;
    }
}

/**
 * The By tag view: one group per tag (A–Z), each with its items (by title),
 * then the untagged ones. An item with two tags is in both groups.
 *
 * @returns {Array<{tag: string|null, items: Array}>} tag null = "No tag"
 */
export function tagGroups(items) {
    const groups = new Map(); // lower-case tag -> { tag, items }
    const untagged = [];
    items.forEach((item) => {
        const tags = item.tags || [];
        if (!tags.length) { untagged.push(item); return; }
        tags.forEach((t) => {
            const k = t.toLowerCase();
            if (!groups.has(k)) groups.set(k, { tag: t, items: [] });
            groups.get(k).items.push(item);
        });
    });
    const out = [...groups.values()].sort((a, b) => collator.compare(a.tag, b.tag));
    out.forEach((g) => g.items.sort(byTitle));
    if (untagged.length) out.push({ tag: null, items: untagged.sort(byTitle) });
    return out;
}

/**
 * This notebook's tags with how many items have each, A–Z (for the tag
 * filter's picker).
 *
 * @returns {Array<{tag: string, count: number}>}
 */
export function tagCounts(items) {
    const counts = new Map(); // lower-case -> { tag, count }
    items.forEach((item) => (item.tags || []).forEach((t) => {
        const k = t.toLowerCase();
        if (!counts.has(k)) counts.set(k, { tag: t, count: 0 });
        counts.get(k).count += 1;
    }));
    return [...counts.values()].sort((a, b) => collator.compare(a.tag, b.tag));
}
