import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { getCardContent, closeNoteWindow, focusNoteWindow, getItemNotebooks } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import { readSavedGeom, saveGeom } from '../utils/noteWindowsSaved';
import { sanitizeCardHtml } from '../utils/sanitize';
import { showApiImages } from '../offline/images';
import { renderMathIn } from '../utils/math';
import { cardChunks } from '../utils/tts';
import { keepPlace, useRestoredPlace } from '../utils/notePlace';
import ReadAloud from './ReadAloud';
import CardEditorInline from './CardEditorInline';

// Default (deliberately roomy) window size, clamped to the viewport.
const DEFAULT_W = 640;
const DEFAULT_H = 580;
const MIN_W = 320;
const MIN_H = 220;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Where a window was last time (utils/noteWindowsSaved.js), kept inside the
// browser window in case that's smaller now.
function savedGeom(cardId) {
    const g = readSavedGeom(cardId);
    if (!g) return null;
    const w = clamp(g.w, MIN_W, Math.max(MIN_W, window.innerWidth - 24));
    const h = clamp(g.h, MIN_H, Math.max(MIN_H, window.innerHeight - 24));
    return {
        x: clamp(g.x, 0, Math.max(0, window.innerWidth - w)),
        y: clamp(g.y, 0, Math.max(0, window.innerHeight - 40)),
        w,
        h,
    };
}

// Each newly opened window is offset down-right from the last so they cascade.
function initialGeom(spawnIndex) {
    const w = Math.min(DEFAULT_W, window.innerWidth - 48);
    const h = Math.min(DEFAULT_H, window.innerHeight - 64);
    const off = (spawnIndex % 6) * 30;
    const x = clamp(120 + off, 12, Math.max(12, window.innerWidth - w - 12));
    const y = clamp(72 + off, 12, Math.max(12, window.innerHeight - h - 12));
    return { x, y, w, h };
}

// A single floating note window. Geometry lives in local state (dragging never
// touches the store); the store only tracks which windows exist and their focus
// order (see noteWindowsReducer).
function NoteWindow({ win, spawnIndex, isActive, getCardContent, closeNoteWindow, focusNoteWindow, getItemNotebooks }) {
    // Where it was last time (after a reload), else the next place in the cascade.
    const [geom, setGeom] = useState(() => savedGeom(win.cardId) || initialGeom(spawnIndex));
    const [maximized, setMaximized] = useState(() => !!(readSavedGeom(win.cardId) || {}).maximized);
    const navigate = useNavigate();
    const [pageError, setPageError] = useState('');

    // Keep its place and size (a moment after it stops moving).
    useEffect(() => {
        const timer = setTimeout(() => saveGeom(win.cardId, geom, maximized), 300);
        return () => clearTimeout(timer);
    }, [geom, maximized, win.cardId]);

    // Open on page: the note becomes the page's open note, in the notebook it
    // was opened from (or, when that isn't known, the first one that holds
    // it), and the window closes.
    const openOnPage = async () => {
        setPageError('');
        let notebook = win.notebook;
        if (!notebook) {
            try { notebook = (await getItemNotebooks(win.cardId))[0] || ''; } catch (e) { notebook = ''; }
        }
        if (!notebook) { setPageError('This note isn’t in a notebook.'); return; }
        closeNoteWindow(win.id);
        navigate(itemPath(notebook, { type: 'card', id: win.cardId }));
    };
    const [content, setContent] = useState(null); // null = loading
    const [failed, setFailed] = useState(false);
    // The pencil turns the window into the note's editor (CardEditorInline,
    // in its window mode); Save keeps editing, ✕ turns it back. `title` follows a
    // rename saved here (the store keeps the title the window opened with).
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(win.title);

    const geomRef = useRef(geom);
    geomRef.current = geom;
    const bodyRef = useRef(null);
    // Switching between reading and editing keeps your place in the note
    // (utils/notePlace.js): the pencil notes the paragraph at the top, and
    // reading again after ✕ opens at the one the editor showed.
    const viewText = () => bodyRef.current && bodyRef.current.querySelector(':scope > .card-content');
    useRestoredPlace(win.cardId, viewText, content != null && !failed && !editing);

    useEffect(() => {
        let cancelled = false;
        getCardContent(win.cardId)
            .then((c) => { if (!cancelled) setContent(c || ''); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [win.cardId]);

    // Render any KaTeX math once the content is in the DOM.
    // In the iPhone app, also its images (offline/images.js).
    useEffect(() => {
        if (editing) return;
        renderMathIn(bodyRef.current);
        showApiImages(bodyRef.current, `card:${win.cardId}`);
    }, [content, editing]);

    // Shared drag handler for both moving (by the title bar) and resizing (corner).
    const startInteraction = (mode) => (e) => {
        if (maximized) return;
        e.preventDefault();
        focusNoteWindow(win.id);
        const start = { x: e.clientX, y: e.clientY, geom: { ...geomRef.current } };
        const onMove = (ev) => {
            const dx = ev.clientX - start.x;
            const dy = ev.clientY - start.y;
            if (mode === 'move') {
                setGeom((g) => ({
                    ...g,
                    x: clamp(start.geom.x + dx, 0, window.innerWidth - g.w),
                    y: clamp(start.geom.y + dy, 0, window.innerHeight - 40),
                }));
            } else {
                setGeom((g) => ({
                    ...g,
                    w: clamp(start.geom.w + dx, MIN_W, window.innerWidth - g.x - 8),
                    h: clamp(start.geom.h + dy, MIN_H, window.innerHeight - g.y - 8),
                }));
            }
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const style = maximized
        ? { left: 12, top: 12, right: 12, bottom: 12, width: 'auto', height: 'auto', zIndex: 1000 + win.z }
        : { left: geom.x, top: geom.y, width: geom.w, height: geom.h, zIndex: 1000 + win.z };

    return (
        <div className={`note-window${isActive ? ' note-window--active' : ''}`}
            style={style}
            onPointerDown={() => focusNoteWindow(win.id)}
            role="dialog" aria-label={title}>
            <div className="note-window__bar" onPointerDown={startInteraction('move')}
                onDoubleClick={() => setMaximized((m) => !m)}>
                <span className="note-window__title">{title}</span>
                {win.notebook && <span className="note-window__from" title={`From ${win.notebook}`}>{win.notebook}</span>}
                <span className="note-window__tools" onPointerDown={(e) => e.stopPropagation()}>
                    {content != null && !failed && !editing && (
                        <>
                            <button type="button" className="card-tool note-window__onpage" title="Open on page"
                                aria-label="Open on page" onClick={openOnPage}>
                                <i className="external alternate icon"></i>
                            </button>
                            <ReadAloud title={title} getChunks={() => cardChunks({ card_id: win.cardId, content })} />
                            <button type="button" className="card-tool" title="Edit note" aria-label="Edit note"
                                onClick={() => { keepPlace(win.cardId, viewText()); setEditing(true); }}>
                                <i className="edit outline icon"></i>
                            </button>
                        </>
                    )}
                    <button type="button" className="card-tool" title={maximized ? 'Restore' : 'Maximize'}
                        aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => setMaximized((m) => !m)}>
                        <i className={`${maximized ? 'compress' : 'expand'} icon`}></i>
                    </button>
                    <button type="button" className="card-tool card-tool--danger" title="Close" aria-label="Close"
                        onClick={() => closeNoteWindow(win.id)}>
                        <i className="times icon"></i>
                    </button>
                </span>
            </div>

            {pageError && <div className="note-window__msg note-window__pageerr" role="alert">{pageError}</div>}
            <div className="note-window__body" ref={bodyRef}>
                {failed ? (
                    <div className="note-window__msg">Couldn't load this note.</div>
                ) : content == null ? (
                    <div className="note-window__msg">Loading…</div>
                ) : editing ? (
                    <CardEditorInline popup={{
                        card: { card_id: win.cardId, title, content },
                        onSaved: (card) => { setContent(card.content || ''); setTitle(card.title || title); },
                        onClose: () => setEditing(false),
                    }} />
                ) : (
                    <div className="card-content" dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(content) }} />
                )}
            </div>

            {!maximized && (
                <i className="note-window__resize" title="Drag to resize" aria-hidden="true"
                    onPointerDown={startInteraction('resize')}>
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M13 5L5 13M13 9L9 13" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
                </i>
            )}
        </div>
    );
}

const mapDispatch = (dispatch) => ({
    getCardContent: (id) => dispatch(getCardContent(id)),
    closeNoteWindow: (id) => dispatch(closeNoteWindow(id)),
    focusNoteWindow: (id) => dispatch(focusNoteWindow(id)),
    getItemNotebooks: (id) => dispatch(getItemNotebooks(id)),
});

export default connect(null, mapDispatch)(NoteWindow);
