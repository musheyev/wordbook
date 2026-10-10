import React, { useEffect, useState } from 'react';
import ttsPlayer, { SKIP_CHOICES } from '../utils/ttsPlayer';

// Big read-aloud controls, over the bottom of the screen whenever something
// is being read (a note, a word, Play all), e.g. for a phone in a car mount:
//
//   Valuation Dashboard Meeting          3 of 12
//      [ ↺ 5 ]     [ ⏸ ]     [ 5 ↻ ]
//      [■ Stop]     Skip [5s] 10s    [⌄ Hide]
//
// Skip sets how far ↺/↻ (and the lock screen) jump; this device remembers
// it. Taps while the next sentence is still loading aren't lost: they're
// applied as soon as it starts (ttsPlayer.seekBy).
// Hide shrinks it to a small "Controls" button; this device remembers that,
// so the next reading starts hidden too. It goes away when the reading ends.
// The small read-aloud buttons (ReadAloud) still work as before. Voice
// previews (VoicePickerDialog) don't bring it up.
const HIDDEN_KEY = 'player-panel-hidden';

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
    const step = state.skip;

    return (
        <div className="player-panel" role="region" aria-label="Playback controls">
            <div className="player-panel__head">
                <span className="player-panel__title">{state.title || 'Reading'}</span>
                {state.total > 1 && (
                    <span className="player-panel__where">{state.index + 1} of {state.total}</span>
                )}
            </div>
            <div className="player-panel__main">
                <button type="button" className="player-panel__big" aria-label={`Back ${step} seconds`}
                    onClick={() => ttsPlayer.seekBy(-step)}>
                    <span className="player-panel__arrow" aria-hidden="true">↺</span>
                    <span className="player-panel__step">{step}</span>
                </button>
                <button type="button" className="player-panel__big player-panel__play"
                    aria-label={playing ? 'Pause' : 'Play'} disabled={loading}
                    onClick={() => ttsPlayer.toggle()}>
                    <i className={`${loading ? 'spinner loading' : playing ? 'pause' : 'play'} icon`} aria-hidden="true"></i>
                </button>
                <button type="button" className="player-panel__big" aria-label={`Forward ${step} seconds`}
                    onClick={() => ttsPlayer.seekBy(step)}>
                    <span className="player-panel__arrow" aria-hidden="true">↻</span>
                    <span className="player-panel__step">{step}</span>
                </button>
            </div>
            <div className="player-panel__foot">
                <button type="button" className="player-panel__small" onClick={() => ttsPlayer.stop()}>
                    <i className="stop icon" aria-hidden="true"></i>Stop
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
