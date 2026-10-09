import React, { useEffect, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';

// Big read-aloud controls, over the bottom of the screen whenever something
// is being read (a note, a word, Play all), e.g. for a phone in a car mount:
//
//   Valuation Dashboard Meeting          3 of 12
//      [ ↺ 5 ]     [ ⏸ ]     [ 5 ↻ ]
//      [■ Stop]                [⌄ Hide]
//
// Hide shrinks it to a small "Controls" button; this device remembers that,
// so the next reading starts hidden too. It goes away when the reading ends.
// The small read-aloud buttons (ReadAloud) still work as before. Voice
// previews (VoicePickerDialog) don't bring it up.
const HIDDEN_KEY = 'player-panel-hidden';
const STEP = 5; // seconds

const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch (e) { return false; } };
const saveHidden = (v) => { try { localStorage.setItem(HIDDEN_KEY, v ? '1' : '0'); } catch (e) { /* not remembered */ } };

export default function PlayerPanel() {
    const [state, setState] = useState(ttsPlayer.snapshot());
    const [hidden, setHidden] = useState(readHidden);

    useEffect(() => ttsPlayer.subscribe(setState), []);

    const active = state.status !== 'idle' && state.sourceId !== 'voice-preview';
    if (!active) return null;

    const hide = (v) => { setHidden(v); saveHidden(v); };

    if (hidden) {
        return (
            <button type="button" className="player-pill" onClick={() => hide(false)}
                aria-label="Show playback controls">
                <i className={`${state.status === 'playing' ? 'volume up' : 'pause'} icon`} aria-hidden="true"></i>
                Controls
            </button>
        );
    }

    const loading = state.status === 'loading';
    const playing = state.status === 'playing';

    return (
        <div className="player-panel" role="region" aria-label="Playback controls">
            <div className="player-panel__head">
                <span className="player-panel__title">{state.title || 'Reading'}</span>
                {state.total > 1 && (
                    <span className="player-panel__where">{state.index + 1} of {state.total}</span>
                )}
            </div>
            <div className="player-panel__main">
                <button type="button" className="player-panel__big" aria-label={`Back ${STEP} seconds`}
                    disabled={loading} onClick={() => ttsPlayer.seekBy(-STEP)}>
                    <span className="player-panel__arrow" aria-hidden="true">↺</span>
                    <span className="player-panel__step">{STEP}</span>
                </button>
                <button type="button" className="player-panel__big player-panel__play"
                    aria-label={playing ? 'Pause' : 'Play'} disabled={loading}
                    onClick={() => ttsPlayer.toggle()}>
                    <i className={`${loading ? 'spinner loading' : playing ? 'pause' : 'play'} icon`} aria-hidden="true"></i>
                </button>
                <button type="button" className="player-panel__big" aria-label={`Forward ${STEP} seconds`}
                    disabled={loading} onClick={() => ttsPlayer.seekBy(STEP)}>
                    <span className="player-panel__arrow" aria-hidden="true">↻</span>
                    <span className="player-panel__step">{STEP}</span>
                </button>
            </div>
            <div className="player-panel__foot">
                <button type="button" className="player-panel__small" onClick={() => ttsPlayer.stop()}>
                    <i className="stop icon" aria-hidden="true"></i>Stop
                </button>
                <button type="button" className="player-panel__small" onClick={() => hide(true)}>
                    <i className="angle down icon" aria-hidden="true"></i>Hide
                </button>
            </div>
        </div>
    );
}
