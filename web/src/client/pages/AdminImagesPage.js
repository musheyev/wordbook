import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAdmin from '../components/hocs/requireAdmin';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchAdminImages, deleteAdminImages } from '../actions';

// Admin › Images (/admin/images): every image in the system, for cleaning up
// inappropriate ones. Words aren't shown — the page is about the pictures.
//
//   tap an image       select / deselect it
//   ⤢ on an image      view it full size, with its own Delete
//   Delete N selected  remove them all, after one confirmation
//   Show: Can't load   only images whose link is broken
//
// Images load 100 at a time ("Load more"). Deleted images are remembered by
// the server and never come back in a refresh (api/image-curation.js).

const keyOf = (item) => `${item.word}\n${item.url}`;

function AdminImagesPage({ fetchAdminImages, deleteAdminImages }) {
    const [images, setImages] = useState([]);   // [{ word, url }] loaded so far
    const [cursor, setCursor] = useState(null); // where the next page starts
    const [total, setTotal] = useState(null);   // all images in the system
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(() => new Set());
    const [broken, setBroken] = useState(() => new Set());
    const [filter, setFilter] = useState('all'); // all | broken
    const [viewing, setViewing] = useState(null); // item shown full size
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const loadPage = async (from) => {
        setLoading(true);
        setError('');
        try {
            const page = await fetchAdminImages(from);
            setImages((prev) => (from ? [...prev, ...page.images] : page.images));
            setCursor(page.cursor);
            if (page.total !== undefined) setTotal(page.total);
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    useEffect(() => { loadPage(null); }, []);

    const toggle = (item) => setSelected((prev) => {
        const next = new Set(prev);
        const key = keyOf(item);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    // Remove deleted images from the page and the counts.
    const removeFromPage = (keys, deletedCount) => {
        setImages((prev) => prev.filter((item) => !keys.has(keyOf(item))));
        setSelected((prev) => new Set([...prev].filter((key) => !keys.has(key))));
        setTotal((n) => (n === null ? n : n - deletedCount));
    };

    const deleteItems = async (items) => {
        setBusy(true);
        setError('');
        try {
            const { deleted } = await deleteAdminImages(items);
            removeFromPage(new Set(items.map(keyOf)), deleted);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const onDeleteSelected = async () => {
        setConfirming(false);
        await deleteItems(images.filter((item) => selected.has(keyOf(item))));
    };

    const onDeleteViewing = async () => {
        if (await deleteItems([viewing])) setViewing(null);
    };

    const shown = filter === 'broken' ? images.filter((item) => broken.has(keyOf(item))) : images;
    const selectedCount = selected.size;

    return (
        <div className="admin-page">
            <div className="admin-page__head">
                <Link className="cb-mbar__back" to="/admin" aria-label="Admin" title="Admin">
                    <i className="chevron left icon" aria-hidden="true"></i>
                </Link>
                <h1 className="cb-page-title">Images</h1>
                {total !== null && <span className="admin-page__count">{total.toLocaleString()} images</span>}
            </div>

            <div className="admin-images__toolbar">
                <label className="admin-images__filter">
                    Show
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="broken">Can't load ({broken.size})</option>
                    </select>
                </label>
                <span className="admin-images__spacer" />
                {selectedCount > 0 && (
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setSelected(new Set())}>
                        Clear
                    </button>
                )}
                <button type="button" className="cb-btn cb-btn--danger" disabled={selectedCount === 0 || busy}
                    onClick={() => setConfirming(true)}>
                    <i className="trash alternate outline icon" aria-hidden="true"></i>
                    Delete {selectedCount > 0 ? `${selectedCount} selected` : 'selected'}
                </button>
            </div>

            {filter === 'broken' && (
                <p className="admin-images__note">
                    {cursor
                        ? `Broken images among the ${images.length} loaded so far. Load more to check the rest.`
                        : `Broken images among all ${images.length}.`}
                </p>
            )}
            {error && <div className="cb-sheet__error admin-images__error">{error}</div>}

            <div className="admin-images__grid">
                {shown.map((item) => {
                    const key = keyOf(item);
                    const isSelected = selected.has(key);
                    return (
                        <div key={key} className={`admin-images__tile${isSelected ? ' is-selected' : ''}`}>
                            <button type="button" className="admin-images__pick" aria-pressed={isSelected}
                                aria-label={isSelected ? 'Deselect image' : 'Select image'} onClick={() => toggle(item)}>
                                {broken.has(key) ? (
                                    <span className="image-broken"><i className="image outline icon" aria-hidden="true"></i>Can't load</span>
                                ) : (
                                    // Not lazy-loaded: the "Can't load" filter relies on
                                    // every loaded image being tried, and a lazy image
                                    // below the fold would never fail (or be counted).
                                    <img src={item.url} alt=""
                                        onError={() => setBroken((prev) => new Set(prev).add(key))} />
                                )}
                                <span className="admin-images__check" aria-hidden="true">
                                    {isSelected && <i className="check icon"></i>}
                                </span>
                            </button>
                            <button type="button" className="admin-images__expand" aria-label="View full size"
                                title="View full size" onClick={() => setViewing(item)}>
                                <i className="expand icon" aria-hidden="true"></i>
                            </button>
                        </div>
                    );
                })}
            </div>

            {!loading && shown.length === 0 && (
                <div className="cb-empty">{filter === 'broken' ? 'No broken images among those loaded.' : 'No images.'}</div>
            )}

            <div className="admin-images__more">
                {loading ? <span className="admin-images__note">Loading…</span> : cursor && (
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={() => loadPage(cursor)}>
                        Load more
                    </button>
                )}
            </div>

            {viewing && (
                <div className="cb-sheet__overlay" onMouseDown={() => setViewing(null)}>
                    <div className="admin-images__viewer" role="dialog" aria-modal="true" aria-label="Image"
                        onMouseDown={(e) => e.stopPropagation()}>
                        {broken.has(keyOf(viewing)) ? (
                            <span className="image-broken image-broken--large"><i className="image outline icon" aria-hidden="true"></i>Can't load</span>
                        ) : (
                            <img src={viewing.url} alt="" />
                        )}
                        <a className="admin-images__source" href={viewing.url} target="_blank" rel="noopener noreferrer">
                            {viewing.url}
                        </a>
                        <div className="cb-sheet__actions">
                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setViewing(null)}>Close</button>
                            <button type="button" className="cb-btn cb-btn--danger" disabled={busy} onClick={onDeleteViewing}>
                                {busy ? 'Deleting…' : 'Delete image'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirming}
                title={`Delete ${selectedCount} ${selectedCount === 1 ? 'image' : 'images'}?`}
                message="They're removed for every user and won't come back when images are refreshed."
                confirmLabel="Delete"
                tone="danger"
                onConfirm={onDeleteSelected}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
}

export default connect(null, { fetchAdminImages, deleteAdminImages })(requireAdmin(AdminImagesPage));
