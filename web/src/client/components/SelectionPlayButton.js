import React, { useEffect, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { selectionChunks } from '../utils/selectionChunks';

// "▶ Play" next to text selected in a note being read (not edited): reads the
// selected sentences, whole (utils/selectionChunks.js, so audio made earlier
// is reused), in the big player — where 🔁 Repeat loops just them. Shown
// just under the selection (on iPhones the system's Copy menu sits above
// it). `rootRef`: the note's text element.
export default function SelectionPlayButton({ rootRef, title }) {
    const [at, setAt] = useState(null); // { top, left } on screen, or null

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
            const r = sel.getRangeAt(0).getBoundingClientRect();
            const width = 96;
            setAt({
                top: Math.min(r.bottom + 8, window.innerHeight - 56),
                left: Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8)),
            });
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
        <button type="button" className="sel-play" style={{ top: at.top, left: at.left }}
            onPointerDown={play} onMouseDown={(e) => e.preventDefault()}
            title="Read the selected sentences aloud" aria-label="Play the selected sentences">
            <i className="play icon" aria-hidden="true"></i>Play
        </button>
    );
}
