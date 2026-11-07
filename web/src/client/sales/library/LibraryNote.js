import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getCardContent } from '../../actions';
import ReadAloud from '../../components/ReadAloud';
import BookmarkButton from '../../components/BookmarkButton';
import ItemColorButton from '../../components/ItemColorButton';
import NoteZoomButton from '../../components/NoteZoomButton';
import SelectionPlayButton from '../../components/SelectionPlayButton';
import Spinner from '../../components/Spinner';
import NotFoundPage from '../../pages/NotFoundPage';
import { useNoteZoom } from '../../utils/noteZoom';
import { colorOf } from '../../utils/itemColors';
import { sanitizeCardHtml } from '../../utils/sanitize';
import { renderMathIn } from '../../utils/math';
import { showApiImages } from '../../offline/images';
import { cardChunks } from '../../utils/tts';
import { useLibrary, libraryNotePath } from './LibraryShell';

// A note of a bought notebook (/learn-spanish/library/<id>/<note id>), read
// only:
//
//   ‹ Getting Around                       3 of 29  ˄ ˅
//   Where would I be able to get a taxi?
//   [▶ Play ⌄] [☆] [A−A+] [●]
//   ┌──────────────────────────────────────────────┐
//   │ the note, as the seller wrote it             │
//   └──────────────────────────────────────────────┘
//
// The toolbar keeps only what changes nothing in the note: Play (and Play
// selected text), Bookmark and Colour (the buyer's own), and Text size (this
// screen only). No Edit, Delete, Move, Share, Copy or the admin tools.
export default function LibraryNote() {
    const { id, noteId } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { findProduct, notebooks } = useLibrary();
    const itemColors = useSelector((state) => state.itemColors);
    const [content, setContent] = useState(null);
    const [failed, setFailed] = useState(false);
    const [noteZoom, setNoteZoom] = useNoteZoom(noteId);
    const ref = useRef(null);

    const product = findProduct(id);
    const notebook = product ? notebooks[product.id] : null;
    const notes = notebook && notebook.status === 'ready' ? notebook.notes : [];
    const index = notes.findIndex((n) => n.id === noteId);
    const note = index === -1 ? null : notes[index];

    useEffect(() => {
        let cancelled = false;
        setContent(null);
        setFailed(false);
        window.scrollTo(0, 0);
        dispatch(getCardContent(noteId))
            .then((html) => { if (!cancelled) setContent(html); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [noteId, dispatch]);

    useEffect(() => {
        if (content == null || !ref.current) return;
        renderMathIn(ref.current);
        showApiImages(ref.current, `card:${noteId}`);
    }, [content, noteId]);

    if (!product) return <NotFoundPage />;
    if (!notebook || notebook.status === 'loading') return <Spinner label="Loading…" />;
    if (notebook.status === 'error') return <p className="sales-note-error">{notebook.message}</p>;
    // Only notes of a notebook they bought.
    if (!note) return <NotFoundPage />;

    const go = (i) => navigate(libraryNotePath(product, notes[i].id), { replace: true });
    const color = colorOf(itemColors, note);
    const item = { type: 'card', id: note.id, title: note.title };

    return (
        <div className="lib-note">
            <div className="nb-back">
                <Link className="nb-back__link" to={`/learn-spanish/library/${product.id}`}>
                    <i className="chevron left icon" aria-hidden="true"></i>
                    <span className="nb-back__name">{product.title}</span>
                </Link>
                {notes.length > 1 && (
                    <div className="nb-back__nav">
                        <span className="nb-back__pos">{index + 1} of {notes.length}</span>
                        <button type="button" className="nb-back__step" aria-label="Previous note"
                            disabled={index === 0} onClick={() => go(index - 1)}>
                            <i className="chevron up icon"></i>
                        </button>
                        <button type="button" className="nb-back__step" aria-label="Next note"
                            disabled={index === notes.length - 1} onClick={() => go(index + 1)}>
                            <i className="chevron down icon"></i>
                        </button>
                    </div>
                )}
            </div>

            <div className="search-result search-result--card">
                <div className="current-word-container">
                    <div className="card-heading"><h2>{note.title}</h2></div>
                    <div className="card-header-actions">
                        {content != null && (
                            <ReadAloud getChunks={() => cardChunks({ card_id: note.id, content })} title={note.title} />
                        )}
                        <BookmarkButton item={item} />
                        <NoteZoomButton level={noteZoom} onChange={setNoteZoom} />
                        <ItemColorButton items={[item]} label={null} className="card-tool" />
                    </div>
                </div>
                {failed && <p className="sales-note-error">Couldn't load this note. Check your connection and try again.</p>}
                {!failed && content == null && <Spinner label="Loading note…" />}
                {content != null && (
                    <>
                        <div className="card-content card-content--scroll" ref={ref}
                            style={{
                                ...(color ? { borderLeftColor: color.ink, '--note-tint': color.tint } : {}),
                                '--note-zoom': noteZoom,
                            }}
                            data-color={color ? color.key : undefined}>
                            <div className="note-zoom-text" dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(content) }} />
                        </div>
                        <SelectionPlayButton rootRef={ref} title={note.title} />
                    </>
                )}
            </div>
        </div>
    );
}
