import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { deleteWordImage, restoreWordImage } from '../actions';
import RefreshImagesDialog from './RefreshImagesDialog';

// The images under a word's definitions.
//
// Everyone sees the images. An image that fails to load stays visible as a
// "Can't load" tile rather than disappearing, so broken links are noticed
// (and admins can delete them).
//
// Admins also get curation controls. Images are shared by all users, so these
// change what everyone sees:
//   ×                 delete an image. No confirm step: it disappears at once
//                     and an "Image deleted · Undo" message offers a few
//                     seconds to take it back.
//   Refresh images    fetch new images from Google (RefreshImagesDialog).

const UNDO_SECONDS = 6;

function WordImages({ word, images, isAdmin, deleteWordImage, restoreWordImage }) {
    const list = Array.isArray(images) ? images : [];
    // URLs whose <img> fired onError. Kept per word: reset when it changes.
    const [broken, setBroken] = useState(() => new Set());
    const [undo, setUndo] = useState(null);        // { url } of the last delete
    const [error, setError] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const undoTimer = useRef(null);

    useEffect(() => {
        setBroken(new Set());
        setUndo(null);
        setError('');
    }, [word]);

    // Clear the undo timer if the component goes away mid-countdown.
    useEffect(() => () => clearTimeout(undoTimer.current), []);

    const markBroken = (url) => setBroken((prev) => new Set(prev).add(url));

    const onDelete = async (url) => {
        setError('');
        clearTimeout(undoTimer.current);
        setUndo({ url });
        undoTimer.current = setTimeout(() => setUndo(null), UNDO_SECONDS * 1000);
        try {
            await deleteWordImage(word, url);
        } catch (err) {
            setUndo(null);
            setError(err.message);
        }
    };

    const onUndo = async () => {
        const { url } = undo;
        clearTimeout(undoTimer.current);
        setUndo(null);
        try {
            await restoreWordImage(word, url);
        } catch (err) {
            setError(err.message);
        }
    };

    if (list.length === 0 && !isAdmin) {
        return null;
    }

    return (
        <section className="word-images" aria-label="Images">
            {isAdmin && (
                <div className="word-images__head">
                    <span className="word-images__title">
                        Images <span className="admin-tag">admin</span>
                    </span>
                    <button type="button" className="cb-btn cb-btn--ghost word-images__refresh"
                        onClick={() => setRefreshing(true)}>
                        <i className="sync alternate icon" aria-hidden="true"></i>
                        Refresh images
                    </button>
                </div>
            )}

            {error && <div className="cb-sheet__error">{error}</div>}

            {list.length === 0 ? (
                <div className="word-images__empty">No images. Use Refresh images to get some.</div>
            ) : (
                <div className="word-images__grid">
                    {list.map((url) => (
                        <div className="word-images__tile" key={url}>
                            {broken.has(url) ? (
                                <div className="image-broken" title={url}>
                                    <i className="image outline icon" aria-hidden="true"></i>
                                    Can't load
                                </div>
                            ) : (
                                <img src={url} alt="" loading="lazy" onError={() => markBroken(url)} />
                            )}
                            {isAdmin && (
                                <button type="button" className="image-delete" aria-label="Delete image"
                                    title="Delete image" onClick={() => onDelete(url)}>
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {undo && (
                <div className="undo-toast" role="status">
                    Image deleted
                    <button type="button" onClick={onUndo}>Undo</button>
                </div>
            )}

            {isAdmin && (
                <RefreshImagesDialog open={refreshing} word={word} shown={list.length}
                    onClose={() => setRefreshing(false)} />
            )}
        </section>
    );
}

function mapStateToProps({ isAdmin }) {
    return { isAdmin: Boolean(isAdmin) };
}

export default connect(mapStateToProps, { deleteWordImage, restoreWordImage })(WordImages);
