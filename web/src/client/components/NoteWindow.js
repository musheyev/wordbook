import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { getCardContent, closeNoteWindow, focusNoteWindow } from '../actions';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { htmlToChunks } from '../utils/tts';
import ReadAloud from './ReadAloud';

// Default (deliberately roomy) window size, clamped to the viewport.
const DEFAULT_W = 640;
const DEFAULT_H = 580;
const MIN_W = 320;
const MIN_H = 220;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
function NoteWindow({ win, spawnIndex, isActive, getCardContent, closeNoteWindow, focusNoteWindow }) {
    const [geom, setGeom] = useState(() => initialGeom(spawnIndex));
    const [maximized, setMaximized] = useState(false);
    const [content, setContent] = useState(null); // null = loading
    const [failed, setFailed] = useState(false);

    const geomRef = useRef(geom);
    geomRef.current = geom;
    const bodyRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        getCardContent(win.cardId)
            .then((c) => { if (!cancelled) setContent(c || ''); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [win.cardId]);

    // Render any KaTeX math once the content is in the DOM.
    useEffect(() => { renderMathIn(bodyRef.current); }, [content]);

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
            role="dialog" aria-label={win.title}>
            <div className="note-window__bar" onPointerDown={startInteraction('move')}
                onDoubleClick={() => setMaximized((m) => !m)}>
                <span className="note-window__title">{win.title}</span>
                <span className="note-window__tools" onPointerDown={(e) => e.stopPropagation()}>
                    {content != null && !failed && (
                        <ReadAloud title={win.title} getChunks={() => htmlToChunks(content)} />
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

            <div className="note-window__body" ref={bodyRef}>
                {failed ? (
                    <div className="note-window__msg">Couldn't load this note.</div>
                ) : content == null ? (
                    <div className="note-window__msg">Loading…</div>
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
});

export default connect(null, mapDispatch)(NoteWindow);
