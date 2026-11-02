import React, { useEffect, useRef, useState } from 'react';
import ttsPlayer, { SKIP_CHOICES } from '../utils/ttsPlayer';
import { getNoteNav, onNoteNav, goToNote } from '../utils/noteAudio';

// Big read-aloud controls, over the bottom of the screen whenever something
// is being read (a note, a word, Play all), e.g. for a phone in a car mount:
//
//   Valuation Dashboard Meeting                 note 3 of 12
//      [ ↺ 5 ]     [ ⏸ ]     [ 5 ↻ ]
//   [  ⏮ Note  ]               [  Note ⏭  ]
//   [  ⏮ 🔖    ]               [    🔖 ⏭  ]
//      [■ Stop]   Skip [5s] 10s   🔁 Repeat   [⌄ Hide]
//
// Also when a note is only ready to be read ("Ready", ▶ to start): opening
// a note gets it ready, on phones always (utils/noteAudio.js).
//
// When the reading ends the panel stays, "Finished", with one big ↻ Replay
// button (from the beginning). 🔁 Repeat (remembered on this device) starts
// it over by itself each time it ends, until Stop.
//
// Note buttons: while several notes are being read (Play all), they move
// within that reading (ttsPlayer.prevNote / nextNote: ⏮ goes to the start
// of the current note, or the one before if it's just started). Otherwise,
// on a note in a notebook, they open the previous / next note there
// (goToNote), which plays at once if one was playing. Bookmark buttons show
// when what's read has bookmarks (🔖 in a note, or headings), and work the
// same way within it (prevBookmark / nextBookmark). Both rows are as easy
// to hit as the buttons above.
// Skip sets how far ↺/↻ (and the lock screen) jump; this device remembers
// it. Taps while the next sentence is still loading aren't lost: they're
// applied as soon as it starts (ttsPlayer.seekBy).
// Drag it by its title row (⠿) to anywhere on screen; it stays fully on
// screen. Not remembered: each new reading opens it in its usual place.
// Hide shrinks it to a small "Controls" button; this device remembers that,
// so the next reading starts hidden too. It goes away when the reading ends.
// The small read-aloud buttons (ReadAloud) still work as before. Voice
// previews (VoicePickerDialog) and the quiz (NotebookQuiz) don't bring it up.
const HIDDEN_KEY = 'player-panel-hidden';

const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch (e) { return false; } };
const saveHidden = (v) => { try { localStorage.setItem(HIDDEN_KEY, v ? '1' : '0'); } catch (e) { /* not remembered */ } };

export default function PlayerPanel() {
    const [state, setState] = useState(ttsPlayer.snapshot());
    const [noteNav, setNoteNav] = useState(getNoteNav);
    const [hidden, setHidden] = useState(readHidden);
    // Where it's been dragged to ({ left, top } on screen), or null: its
    // usual place. Forgotten when the reading stops.
    const [pos, setPos] = useState(null);
    const panelRef = useRef(null);
    const drag = useRef(null);

    useEffect(() => ttsPlayer.subscribe(setState), []);
    useEffect(() => onNoteNav(setNoteNav), []);
    useEffect(() => { if (state.status === 'idle') setPos(null); }, [state.status]);

    const active = state.status !== 'idle' && state.sourceId !== 'voice-preview' && state.sourceId !== 'quiz';
    if (!active) return null;

    const hide = (v) => { setHidden(v); saveHidden(v); };

    if (hidden) {
        return (
            <button type="button" className="player-pill" onClick={() => hide(false)}
                aria-label="Show playback controls">
                <i className={`${state.status === 'playing' ? 'volume up' : state.status === 'ready' ? 'play' : 'pause'} icon`}
                    aria-hidden="true"></i>
                Controls
            </button>
        );
    }

    // Dragging by the title row: the panel follows the pointer, kept on screen.
    const onDragStart = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const r = panelRef.current.getBoundingClientRect();
        drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
    };
    const onDragMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const left = Math.max(4, Math.min(e.clientX - d.dx, window.innerWidth - d.w - 4));
        const top = Math.max(4, Math.min(e.clientY - d.dy, window.innerHeight - d.h - 4));
        setPos({ left, top, width: d.w });
    };
    const onDragEnd = () => { drag.current = null; };

    const loading = state.status === 'loading';
    const playing = state.status === 'playing';
    const ended = state.status === 'ended';
    const ready = state.status === 'ready';
    const step = state.skip;
    // Note buttons: within Play all, or the notebook's previous / next note.
    const manyNotes = state.notes > 1;
    const noteButtons = manyNotes || !!(noteNav.prev || noteNav.next);
    const prevNote = () => (manyNotes ? ttsPlayer.prevNote() : goToNote(-1));
    const nextNote = () => (manyNotes ? ttsPlayer.nextNote() : goToNote(1));

    return (
        <div className={`player-panel${pos ? ' player-panel--moved' : ''}`} role="region" aria-label="Playback controls"
            ref={panelRef} style={pos ? { left: pos.left, top: pos.top, width: pos.width } : undefined}>
            <div className="player-panel__head" title="Drag to move"
                onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
                <span className="player-panel__grip" aria-hidden="true">⠿</span>
                <span className="player-panel__title">{state.title || 'Reading'}</span>
                {ended ? (
                    <span className="player-panel__where">Finished</span>
                ) : ready ? (
                    <span className="player-panel__where">Ready</span>
                ) : state.notes > 1 ? (
                    <span className="player-panel__where">note {state.note} of {state.notes}</span>
                ) : state.total > 1 && (
                    <span className="player-panel__where">{state.index + 1} of {state.total}</span>
                )}
            </div>
            {ended ? (
                <div className="player-panel__main">
                    <button type="button" className="player-panel__big player-panel__play player-panel__replay"
                        aria-label="Replay from the beginning" onClick={() => ttsPlayer.replay()}>
                        <i className="redo alternate icon" aria-hidden="true"></i>
                        <span className="player-panel__replay-label">Replay</span>
                    </button>
                </div>
            ) : (
            <div className="player-panel__main">
                <button type="button" className="player-panel__big" aria-label={`Back ${step} seconds`}
                    disabled={ready} onClick={() => ttsPlayer.seekBy(-step)}>
                    <span className="player-panel__arrow" aria-hidden="true">↺</span>
                    <span className="player-panel__step">{step}</span>
                </button>
                <button type="button" className="player-panel__big player-panel__play"
                    aria-label={playing ? 'Pause' : 'Play'} disabled={loading}
                    onClick={() => ttsPlayer.toggle()}>
                    <i className={`${loading ? 'spinner loading' : playing ? 'pause' : 'play'} icon`} aria-hidden="true"></i>
                </button>
                <button type="button" className="player-panel__big" aria-label={`Forward ${step} seconds`}
                    disabled={ready} onClick={() => ttsPlayer.seekBy(step)}>
                    <span className="player-panel__arrow" aria-hidden="true">↻</span>
                    <span className="player-panel__step">{step}</span>
                </button>
            </div>
            )}
            {!ended && noteButtons && (
                <div className="player-panel__nav">
                    <button type="button" className="player-panel__jump" aria-label="Previous note"
                        disabled={!manyNotes && !noteNav.prev} onClick={prevNote}>⏮ Note</button>
                    <button type="button" className="player-panel__jump" aria-label="Next note"
                        disabled={!manyNotes && !noteNav.next} onClick={nextNote}>Note ⏭</button>
                </div>
            )}
            {!ended && state.bookmarks && (
                <div className="player-panel__nav">
                    <button type="button" className="player-panel__jump" aria-label="Previous bookmark"
                        onClick={() => ttsPlayer.prevBookmark()}>⏮ 🔖</button>
                    <button type="button" className="player-panel__jump" aria-label="Next bookmark"
                        onClick={() => ttsPlayer.nextBookmark()}>🔖 ⏭</button>
                </div>
            )}
            <div className="player-panel__foot">
                <button type="button" className="player-panel__small" onClick={() => ttsPlayer.stop()}>
                    <i className="stop icon" aria-hidden="true"></i>Stop
                </button>
                <button type="button" aria-pressed={state.repeat}
                    className={`player-panel__repeat${state.repeat ? ' on' : ''}`}
                    title={state.repeat ? 'Repeat is on: starts over when it ends' : 'Repeat: start over when it ends'}
                    onClick={() => ttsPlayer.setRepeat(!state.repeat)}>
                    🔁<span className="player-panel__repeat-label">Repeat</span>
                </button>
                <div className="player-panel__skip" role="group" aria-label="Skip by">
                    <span className="player-panel__skip-label">Skip</span>
                    {SKIP_CHOICES.map((s) => (
                        <button type="button" key={s} aria-pressed={step === s}
                            className={`player-panel__skip-btn${step === s ? ' on' : ''}`}
                            onClick={() => ttsPlayer.setSkip(s)}>{s}s</button>
                    ))}
                </div>
                <button type="button" className="player-panel__small" onClick={() => hide(true)}>
                    <i className="angle down icon" aria-hidden="true"></i>Hide
                </button>
            </div>
        </div>
    );
}
