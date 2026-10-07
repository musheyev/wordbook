import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import {
    deleteWordImage, restoreWordImage, uploadWordImage,
    removeMyWordImage, restoreMyWordImage, shareMyWordImage, fetchImageSearchEnabled,
} from '../actions';
import RefreshImagesDialog from './RefreshImagesDialog';
import AddWordImageDialog from './AddWordImageDialog';

// The images under a word's definitions. Two kinds, shown together:
//
//   shared  the word's images everyone sees (Brave search results, and ones
//           admins made available to everyone). Admins can delete them (×).
//   yours   images the signed-in user added themselves (from their device or
//           a link). Only they see them; marked "Yours", removable with ×.
//           Admins can also make one of theirs available to everyone (globe).
//
// Removing either kind is instant, with an "Image removed · Undo" message
// for a few seconds. An image that fails to load stays visible as a "Can't
// load" tile rather than disappearing, so broken links are noticed.
//
// Signed-in users get "Add image" (AddWordImageDialog) and can drop an image
// file onto the section. Admins also get "Refresh images", off while an
// admin has turned Brave image search off (Admin › Images).

const UNDO_SECONDS = 6;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function WordImages({
    word, images, myWordImages, isAdmin, auth, imageSearchEnabled,
    deleteWordImage, restoreWordImage, uploadWordImage,
    removeMyWordImage, restoreMyWordImage, shareMyWordImage, fetchImageSearchEnabled,
}) {
    const shared = Array.isArray(images) ? images : [];
    const mine = myWordImages && myWordImages.word === word ? myWordImages.images : [];
    const loggedIn = Boolean(auth);

    // URLs whose <img> fired onError. Kept per word: reset when it changes.
    const [broken, setBroken] = useState(() => new Set());
    const [undo, setUndo] = useState(null);        // { url, kind } of the last removal
    const [error, setError] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [adding, setAdding] = useState(false);
    const [dropping, setDropping] = useState(false);
    const [uploading, setUploading] = useState(false);
    const undoTimer = useRef(null);

    // The user's own images come with the word lookup (fetchWordData).
    useEffect(() => {
        setBroken(new Set());
        setUndo(null);
        setError('');
    }, [word]);

    useEffect(() => {
        if (isAdmin && imageSearchEnabled === null) fetchImageSearchEnabled();
    }, [isAdmin, imageSearchEnabled, fetchImageSearchEnabled]);

    // Clear the undo timer if the component goes away mid-countdown.
    useEffect(() => () => clearTimeout(undoTimer.current), []);

    const markBroken = (url) => setBroken((prev) => new Set(prev).add(url));

    const onRemove = async (url, kind) => {
        setError('');
        clearTimeout(undoTimer.current);
        setUndo({ url, kind });
        undoTimer.current = setTimeout(() => setUndo(null), UNDO_SECONDS * 1000);
        try {
            if (kind === 'mine') await removeMyWordImage(word, url);
            else await deleteWordImage(word, url);
        } catch (err) {
            setUndo(null);
            setError(err.message);
        }
    };

    const onUndo = async () => {
        const { url, kind } = undo;
        clearTimeout(undoTimer.current);
        setUndo(null);
        try {
            if (kind === 'mine') await restoreMyWordImage(word, url);
            else await restoreWordImage(word, url);
        } catch (err) {
            setError(err.message);
        }
    };

    const onShare = async (url) => {
        setError('');
        try {
            await shareMyWordImage(word, url);
        } catch (err) {
            setError(err.message);
        }
    };

    // Drop image files on the section: each one is added as the user's own.
    const isFileDrag = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
    const onDragOver = (e) => {
        if (!loggedIn || !isFileDrag(e)) return;
        e.preventDefault();
        setDropping(true);
    };
    const onDrop = async (e) => {
        if (!loggedIn || !isFileDrag(e)) return;
        e.preventDefault();
        setDropping(false);
        const files = Array.from(e.dataTransfer.files || []).filter((f) => IMAGE_TYPES.includes(f.type));
        if (files.length === 0) { setError('Drop a PNG, JPEG, GIF or WebP image.'); return; }
        setError('');
        setUploading(true);
        try {
            for (const file of files) await uploadWordImage(word, file, false);
        } catch (err) {
            setError(err.message);
        }
        setUploading(false);
    };

    if (shared.length === 0 && mine.length === 0 && !loggedIn) {
        return null;
    }

    const searchOff = imageSearchEnabled === false;
    const tile = (url, kind) => (
        <div className={`word-images__tile${kind === 'mine' ? ' word-images__tile--mine' : ''}`} key={`${kind}:${url}`}>
            {broken.has(url) ? (
                <div className="image-broken" title={url}>
                    <i className="image outline icon" aria-hidden="true"></i>
                    Can't load
                </div>
            ) : (
                <img src={url} alt="" loading="lazy" onError={() => markBroken(url)} />
            )}
            {kind === 'mine' && <span className="word-images__yours">Yours</span>}
            {kind === 'mine' && isAdmin && (
                <button type="button" className="image-share" aria-label="Make available to everyone"
                    title="Make available to everyone" onClick={() => onShare(url)}>
                    <i className="globe icon" aria-hidden="true"></i>
                </button>
            )}
            {(kind === 'mine' || isAdmin) && (
                <button type="button" className="image-delete" aria-label="Remove image"
                    title="Remove image" onClick={() => onRemove(url, kind)}>
                    ×
                </button>
            )}
        </div>
    );

    return (
        <section className={`word-images${dropping ? ' word-images--dropping' : ''}`} aria-label="Images"
            onDragOver={onDragOver} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
            <div className="word-images__head">
                <span className="word-images__title">Images</span>
                <span className="word-images__actions">
                    {loggedIn && (
                        <button type="button" className="cb-btn cb-btn--ghost word-images__refresh"
                            onClick={() => setAdding(true)}>
                            <i className="plus icon" aria-hidden="true"></i>
                            Add image
                        </button>
                    )}
                    {isAdmin && (
                        <button type="button" className="cb-btn cb-btn--ghost word-images__refresh"
                            onClick={() => setRefreshing(true)} disabled={searchOff}
                            title={searchOff ? 'Image search is turned off in Admin › Images' : undefined}>
                            <i className="sync alternate icon" aria-hidden="true"></i>
                            Refresh images
                        </button>
                    )}
                </span>
            </div>

            {isAdmin && searchOff && (
                <div className="word-images__note">Image search is turned off in Admin › Images.</div>
            )}
            {error && <div className="cb-sheet__error">{error}</div>}

            {shared.length === 0 && mine.length === 0 ? (
                <div className="word-images__empty">
                    {uploading ? 'Adding…' : loggedIn ? (
                        <>
                            <span className="word-images__mouse-only">No images yet. Drop an image here, or use Add image.</span>
                            <span className="word-images__touch-only">No images yet. Use Add image.</span>
                        </>
                    ) : 'No images yet.'}
                </div>
            ) : (
                <div className="word-images__grid">
                    {shared.map((url) => tile(url, 'shared'))}
                    {mine.map((url) => tile(url, 'mine'))}
                    {uploading && <div className="word-images__tile word-images__adding">Adding…</div>}
                </div>
            )}

            {undo && (
                <div className="undo-toast" role="status">
                    Image removed
                    <button type="button" onClick={onUndo}>Undo</button>
                </div>
            )}

            {isAdmin && (
                <RefreshImagesDialog open={refreshing} word={word} shown={shared.length}
                    onClose={() => setRefreshing(false)} />
            )}
            {loggedIn && (
                <AddWordImageDialog open={adding} word={word} isAdmin={isAdmin}
                    onClose={() => setAdding(false)} />
            )}
        </section>
    );
}

function mapStateToProps({ isAdmin, auth, myWordImages, imageSearchEnabled }) {
    return { isAdmin: Boolean(isAdmin), auth, myWordImages, imageSearchEnabled };
}

export default connect(mapStateToProps, {
    deleteWordImage, restoreWordImage, uploadWordImage,
    removeMyWordImage, restoreMyWordImage, shareMyWordImage, fetchImageSearchEnabled,
})(WordImages);
