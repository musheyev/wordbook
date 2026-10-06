import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { uploadWordImage, addWordImageFromLink } from '../actions';

// "Add an image" for a word (from WordImages). A dialog on desktop, a bottom
// sheet on phones (the shared .cb-sheet styles). Two tabs:
//
//   From your device  choose a file (on a phone: photo library or camera),
//                     drop one on the dialog, or paste one (Ctrl/Cmd+V)
//   From a link       a web address; the image previews right away. The
//                     server saves its own copy, so it keeps working if the
//                     original disappears (api/fetch-image.js).
//
// Admins also get "Show to everyone", which adds the image to the word's
// shared images instead of their own.

const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 12 * 1024 * 1024;
const isWebAddress = (text) => /^https?:\/\/\S+\.\S+/i.test(text.trim());

function AddWordImageDialog({ open, word, isAdmin, onClose, uploadWordImage, addWordImageFromLink }) {
    const [tab, setTab] = useState('device');
    const [file, setFile] = useState(null);
    const [filePreview, setFilePreview] = useState('');
    const [link, setLink] = useState('');
    const [linkState, setLinkState] = useState('idle'); // idle | loading | ok | failed
    const [shared, setShared] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const fileInput = useRef(null);

    // Start fresh each time it opens.
    useEffect(() => {
        if (!open) return;
        setTab('device'); setFile(null); setLink(''); setLinkState('idle');
        setShared(false); setBusy(false); setError('');
    }, [open]);

    // A preview URL for the chosen file, released when it changes.
    useEffect(() => {
        if (!file) { setFilePreview(''); return undefined; }
        const url = URL.createObjectURL(file);
        setFilePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onClose]);

    if (!open) return null;

    const pickFile = (candidate) => {
        setError('');
        if (!candidate) return;
        if (!TYPES.includes(candidate.type)) { setError('Choose a PNG, JPEG, GIF or WebP image.'); return; }
        if (candidate.size > MAX_BYTES) { setError('That image is larger than 12 MB.'); return; }
        setTab('device');
        setFile(candidate);
    };

    const imageFrom = (dataTransfer) => {
        if (!dataTransfer) return null;
        const fromFiles = Array.from(dataTransfer.files || []).find((f) => f.type.startsWith('image/'));
        if (fromFiles) return fromFiles;
        const item = Array.from(dataTransfer.items || []).find((it) => it.kind === 'file' && it.type.startsWith('image/'));
        return item ? item.getAsFile() : null;
    };

    const onPaste = (e) => {
        const pasted = imageFrom(e.clipboardData);
        if (pasted) { e.preventDefault(); pickFile(pasted); }
    };
    const onDrop = (e) => {
        const dropped = imageFrom(e.dataTransfer);
        if (dropped) { e.preventDefault(); pickFile(dropped); }
    };

    const changeLink = (value) => {
        setLink(value);
        setError('');
        setLinkState(isWebAddress(value) ? 'loading' : 'idle');
    };

    // Add works once there's something to add. A link whose preview failed
    // can still be tried: some sites block showing their images on other
    // sites but still let the server download them.
    const ready = tab === 'device' ? Boolean(file) : isWebAddress(link) && linkState !== 'loading';

    const submit = async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError('');
        try {
            if (tab === 'device') await uploadWordImage(word, file, isAdmin && shared);
            else await addWordImageFromLink(word, link.trim(), isAdmin && shared);
            onClose();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <div className="cb-sheet__overlay" onMouseDown={() => { if (!busy) onClose(); }}>
            <form className="cb-sheet add-image" role="dialog" aria-modal="true"
                aria-label={`Add an image to "${word}"`} onSubmit={submit}
                onMouseDown={(e) => e.stopPropagation()} onPaste={onPaste}
                onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <h3 className="cb-sheet__title">Add an image to “{word}”</h3>

                <div className="add-image__tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'device'}
                        className={`add-image__tab${tab === 'device' ? ' is-on' : ''}`}
                        onClick={() => { setTab('device'); setError(''); }}>From your device</button>
                    <button type="button" role="tab" aria-selected={tab === 'link'}
                        className={`add-image__tab${tab === 'link' ? ' is-on' : ''}`}
                        onClick={() => { setTab('link'); setError(''); }}>From a link</button>
                </div>

                {tab === 'device' ? (
                    <div className="add-image__drop" onClick={() => fileInput.current && fileInput.current.click()}>
                        {filePreview ? (
                            <img className="add-image__preview" src={filePreview} alt="" />
                        ) : (
                            <>
                                <i className="image outline icon" aria-hidden="true"></i>
                                <span className="add-image__hint">
                                    <span className="add-image__choose">Choose an image…</span>
                                    <span className="add-image__desktop-hint"> or drop or paste one here</span>
                                </span>
                                <span className="add-image__small">PNG, JPEG, GIF or WebP, up to 12 MB</span>
                            </>
                        )}
                        <input ref={fileInput} type="file" hidden accept={TYPES.join(',')}
                            onChange={(e) => { pickFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
                    </div>
                ) : (
                    <div className="add-image__link">
                        <input className="cb-sheet__input" type="url" inputMode="url" autoFocus
                            placeholder="https://…/picture.jpg" aria-label="Image web address"
                            value={link} onChange={(e) => changeLink(e.target.value)} />
                        {isWebAddress(link) && (
                            <div className="add-image__drop add-image__drop--static">
                                <img className="add-image__preview" src={link.trim()} alt=""
                                    style={linkState === 'failed' ? { display: 'none' } : undefined}
                                    onLoad={() => setLinkState('ok')} onError={() => setLinkState('failed')} />
                                {linkState === 'loading' && <span className="add-image__small">Loading preview…</span>}
                                {linkState === 'failed' && (
                                    <span className="add-image__small">
                                        Couldn't show a preview. Some sites block this; you can still try adding it.
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {isAdmin && (
                    <label className="add-image__shared">
                        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                        Show to everyone (adds it to the shared images)
                    </label>
                )}

                {error && <div className="cb-sheet__error">{error}</div>}

                <div className="cb-sheet__actions">
                    <button type="button" className="cb-btn" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="submit" className="cb-btn cb-btn--accent" disabled={!ready || busy}>
                        {busy ? 'Adding…' : 'Add'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default connect(null, { uploadWordImage, addWordImageFromLink })(AddWordImageDialog);
