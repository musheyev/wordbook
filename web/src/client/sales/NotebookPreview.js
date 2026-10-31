import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { getCardContent } from '../actions';
import ReadAloud from '../components/ReadAloud';
import Spinner from '../components/Spinner';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { showApiImages } from '../offline/images';
import { cardChunks } from '../utils/tts';
import { formatPrice } from './catalog';

// Preview of a notebook for sale, over the sales page (a full-screen sheet on
// phones):
//
//   Getting Around                                   [×]
//   Beginner · 29 notes
//   ─────────────────────────────────────────────────
//   Hola                                          🔒
//   Where would I be able to get a taxi?      Free ⌄
//     ┌ its first two lines, fading out ────────┐
//     │ ¿Dónde puedo tomar un taxi? …           │
//     └─────────────────────────────────────────┘
//     [▶ Play]
//   …
//   ─────────────────────────────────────────────────
//   $9.99                                     [Buy]
//
// Free samples (sales/catalog.js) open in place, showing two lines, with
// Play for the whole note; the rest show only their titles, locked. `openSample` opens one sample to begin with
// ("Try a free note").
export default function NotebookPreview({ product, notebook, openSample, onClose }) {
    const [open, setOpen] = useState(openSample || null);
    const closeRef = useRef(null);

    // Escape closes it; the page behind doesn't scroll while it's open.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        if (closeRef.current) closeRef.current.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    const ready = notebook.status === 'ready';

    return (
        <div className="sales-preview" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="sales-preview__dialog" role="dialog" aria-modal="true" aria-labelledby="sales-preview-title">
                <header className="sales-preview__head">
                    <div>
                        <h2 id="sales-preview-title">{product.title}</h2>
                        <p className="sales-preview__meta">
                            {product.level}{ready ? ` · ${notebook.notes.length} notes · ${notebook.sampleIds.size} free to try` : ''}
                        </p>
                    </div>
                    <button type="button" className="sales-preview__close" ref={closeRef} onClick={onClose} aria-label="Close preview">
                        <i className="close icon" aria-hidden="true"></i>
                    </button>
                </header>

                <div className="sales-preview__body">
                    {notebook.status === 'loading' && <Spinner label="Loading the notes…" />}
                    {notebook.status === 'error' && <p className="sales-note-error">{notebook.message}</p>}
                    {ready && (
                        <ol className="sales-preview__list">
                            {notebook.notes.map((note) => {
                                const free = notebook.sampleIds.has(note.id);
                                const isOpen = free && open === note.id;
                                return (
                                    <li key={note.id} className={`sales-preview__item${free ? ' is-free' : ''}${isOpen ? ' is-open' : ''}`}>
                                        {free ? (
                                            <button type="button" className="sales-preview__row" aria-expanded={isOpen}
                                                onClick={() => setOpen(isOpen ? null : note.id)}>
                                                <span className="sales-preview__title">{note.title}</span>
                                                <span className="sales-badge">Free</span>
                                                <i className={`chevron ${isOpen ? 'up' : 'down'} icon`} aria-hidden="true"></i>
                                            </button>
                                        ) : (
                                            <div className="sales-preview__row is-locked">
                                                <span className="sales-preview__title">{note.title}</span>
                                                <i className="lock icon" aria-label="Included when you buy"></i>
                                            </div>
                                        )}
                                        {isOpen && <SampleNote id={note.id} title={note.title} />}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>

                <footer className="sales-preview__foot">
                    <span className="sales-preview__price">{formatPrice(product.price)}</span>
                    <Link to={`/learn-spanish/checkout/${product.id}`} className="cb-btn cb-btn--accent sales-btn">
                        Buy {product.title}
                    </Link>
                </footer>
            </div>
        </div>
    );
}

// One free sample, shown as in the app (the same note styles), with Play.
// Only its first two lines show (sales.css); Play reads the whole note.
function SampleNote({ id, title }) {
    const dispatch = useDispatch();
    const [content, setContent] = useState(null);
    const [failed, setFailed] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        let cancelled = false;
        dispatch(getCardContent(id))
            .then((html) => { if (!cancelled) setContent(html); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [id, dispatch]);

    useEffect(() => {
        if (content == null || !ref.current) return;
        renderMathIn(ref.current);
        showApiImages(ref.current, `card:${id}`);
    }, [content, id]);

    if (failed) return <p className="sales-note-error">Couldn't load this note.</p>;
    if (content == null) return <Spinner label="Loading…" inline />;

    return (
        <div className="sales-sample">
            <div className="card-content sales-sample__note" ref={ref}>
                <div className="note-zoom-text" dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(content) }} />
            </div>
            <ReadAloud label="Play" voices={false} title={title}
                getChunks={() => cardChunks({ card_id: id, content })} />
        </div>
    );
}
