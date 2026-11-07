// Which notebooks you "bought" at the pretend checkout (CheckoutPage), so
// the buyer's library (sales/library/) shows just those.
//
// LOCALHOST ONLY, and pretend: the catalog ids (sales/catalog.js) are kept in
// this browser's localStorage, nothing else. Real purchases will live on the
// server, tied to the buyer's account, once payments are real.
//
// localStorage can be missing or refuse (a private window, blocked site
// data), so every read and write is wrapped: then nothing counts as bought.
const KEY = 'sales.pretendPurchases';

/** The catalog ids bought in this browser, in the order they were bought. */
export function boughtIds() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
    } catch (e) {
        return [];
    }
}

/** Count `id` as bought (CheckoutPage, once the pretend payment goes through). */
export function addPurchase(id) {
    const list = boughtIds();
    if (list.includes(id)) return;
    try { localStorage.setItem(KEY, JSON.stringify([...list, id])); } catch (e) { /* not kept */ }
}

/** Forget every pretend purchase (the library's "Forget them", for testing). */
export function forgetPurchases() {
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing kept anyway */ }
}
