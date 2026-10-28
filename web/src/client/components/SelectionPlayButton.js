import React, { useEffect, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { selectionChunks } from '../utils/selectionChunks';

// "▶ Play" for text selected in a note being read (not edited): reads the
// selected sentences, whole (utils/selectionChunks.js, so audio made earlier
// is reused), in the big player — where 🔁 Repeat loops just them.
// `rootRef`: the note's text element.
//
// Where it goes:
//   - With a mouse: just under the selection.
//   - On a touch screen (iPhone, iPad): the system's own Copy / Look Up menu
//     shows next to the selection, sometimes above it and sometimes below,
//     and a page can't tell which. It sits on top of everything, so a Play
//     button near the selection could end up under it. So Play is pinned
//     away from the selection instead: bottom left, level with the player's
//     Controls pill (.sel-play--pinned). If the selection reaches down into
//     that corner, or the open player panel covers it, Play goes to the
//     top left of the screen (.sel-play--top), or just above the panel.

const WIDTH = 96;
const HEIGHT = 40;
// How far up from the bottom the pinned button reaches (its bottom offset —
// above the phone's tab bar and home bar — plus its height and a gap).
const PINNED_ZONE = 170;

const isTouch = () => typeof window !== 'undefined'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * Where Play goes for a selection.
 * @param {DOMRect} r the selection's box on screen
 * @returns {{ className: string, style: object }}
 */
function placement(r) {
    if (!isTouch()) {
        return {
            className: '',
            style: {
                top: Math.min(r.bottom + 8, window.innerHeight - 56),
                left: Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8)),
            },
        };
    }
    // The open player panel (PlayerPanel.js), if it's on screen: Play sits
    // just above it rather than behind it.
    const panel = document.querySelector('.player-panel');
    const panelTop = panel ? panel.getBoundingClientRect().top : null;
    if (panelTop !== null && panelTop > 0) {
        if (r.bottom < panelTop - HEIGHT - 24) {
            return { className: ' sel-play--pinned', style: { bottom: window.innerHeight - panelTop + 10 } };
        }
        return { className: ' sel-play--top', style: {} };
    }
    if (r.bottom > window.innerHeight - PINNED_ZONE) return { className: ' sel-play--top', style: {} };
    return { className: ' sel-play--pinned', style: {} };
}

export default function SelectionPlayButton({ rootRef, title }) {
    const [at, setAt] = useState(null); // placement(), or null when nothing's selected

    useEffect(() => {
        const update = () => {
            const root = rootRef.current;
            const sel = document.getSelection();
            if (!root || !sel || sel.isCollapsed || !sel.rangeCount
                || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)
                || !sel.toString().trim()) {
                setAt(null);
                return;
            }
            setAt(placement(sel.getRangeAt(0).getBoundingClientRect()));
        };
        document.addEventListener('selectionchange', update);
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            document.removeEventListener('selectionchange', update);
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [rootRef]);

    if (!at) return null;

    // On pointer down, before the tap can clear the selection; prime() keeps
    // iPhones willing to play audio started from here.
    const play = (e) => {
        e.preventDefault();
        const chunks = selectionChunks(document.getSelection(), rootRef.current);
        if (!chunks.length) return;
        ttsPlayer.prime();
        ttsPlayer.play(chunks, { title: title ? `${title} — selection` : 'Selection', sourceId: 'selection' });
    };

    return (
        <button type="button" className={`sel-play${at.className}`} style={at.style}
            onPointerDown={play} onMouseDown={(e) => e.preventDefault()}
            title="Read the selected sentences aloud" aria-label="Play the selected sentences">
            <i className="play icon" aria-hidden="true"></i>Play
        </button>
    );
}
