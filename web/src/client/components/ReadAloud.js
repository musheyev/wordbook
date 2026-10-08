import React, { useEffect, useRef, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { getChosenVoices, setChosenVoice, TTS_LANGUAGES, TTS_SPEEDS, getChosenSpeeds, setChosenSpeed } from '../utils/tts';
import { loadVoices } from '../utils/ttsVoices';

let uid = 0;

// Read-aloud control: a play/pause button, a stop button while active, and a
// voice picker. `getChunks` returns the chunks to read (may be async, e.g. a
// whole notebook). Playback is shared across the app via ttsPlayer.
function ReadAloud({ getChunks, title, label }) {
    const idRef = useRef(`ra${++uid}`);
    const [state, setState] = useState(ttsPlayer.snapshot());
    const [error, setError] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    // The voice picker shows one language at a time (there are six, each with
    // many voices). "Auto" lets Google pick that language's default voice.
    const [pickerLang, setPickerLang] = useState('en-US');
    const [voices, setVoices] = useState({});
    const [chosen, setChosen] = useState(getChosenVoices());
    const [speeds, setSpeeds] = useState(getChosenSpeeds());

    useEffect(() => ttsPlayer.subscribe(setState), []);

    const mine = state.sourceId === idRef.current;
    const active = mine && state.status !== 'idle';

    const onToggle = async () => {
        setError('');
        if (mine && state.status === 'playing') { ttsPlayer.pause(); return; }
        if (mine && state.status === 'paused') { ttsPlayer.resume(); return; }
        ttsPlayer.prime(); // must run synchronously in the click (iOS)
        let chunks = [];
        try { chunks = await getChunks(); } catch (e) { setError('Could not prepare audio.'); return; }
        if (!chunks || chunks.length === 0) { setError('Nothing to read here.'); return; }
        await ttsPlayer.play(chunks, { title, sourceId: idRef.current });
        const snap = ttsPlayer.snapshot();
        if (snap.error) setError(snap.error);
    };

    const showLang = async (lang) => {
        setPickerLang(lang);
        if (voices[lang]) return;
        const list = await loadVoices(lang);
        setVoices((prev) => ({ ...prev, [lang]: list }));
    };

    const openMenu = () => {
        const next = !menuOpen;
        setMenuOpen(next);
        if (next) showLang(pickerLang);
    };

    const pick = (lang, name) => { setChosenVoice(lang, name); setChosen(getChosenVoices()); };
    // Takes effect from the next sentence read in that language.
    const pickSpeed = (lang, speed) => { setChosenSpeed(lang, speed); setSpeeds(getChosenSpeeds()); };

    const playIcon = state.status === 'loading' ? 'spinner loading'
        : (mine && state.status === 'playing') ? 'pause' : 'volume up';

    return (
        <span className="read-aloud">
            {label ? (
                <button type="button" className="cb-btn cb-btn--ghost read-aloud__labelled" onClick={onToggle}>
                    <i className={`${playIcon} icon`}></i>
                    {mine && state.status === 'playing' ? 'Pause' : label}
                </button>
            ) : (
                <button type="button" className="card-tool" title="Read aloud" aria-label="Read aloud" onClick={onToggle}>
                    <i className={`${playIcon} icon`}></i>
                </button>
            )}

            {active && (
                <button type="button" className="card-tool read-aloud__stop" title="Stop" aria-label="Stop reading"
                    onClick={() => ttsPlayer.stop()}>
                    <i className="stop icon"></i>
                </button>
            )}

            <span className="read-aloud__voices-wrap">
                <button type="button" className="card-tool read-aloud__voices" title="Choose voice"
                    aria-label="Choose voice" aria-haspopup="menu" aria-expanded={menuOpen} onClick={openMenu}>
                    <i className="angle down icon"></i>
                </button>
                {menuOpen && (
                    <>
                        <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                        <div className="cb-menu__list read-aloud__menu" role="menu">
                            <label className="read-aloud__lang-pick">
                                Voice for
                                <select value={pickerLang} onChange={(e) => showLang(e.target.value)}>
                                    {TTS_LANGUAGES.map((l) => (
                                        <option key={l.code} value={l.code}>
                                            {l.label}{chosen[l.code] ? ' •' : ''}{speeds[l.code] ? ` (${speeds[l.code]}×)` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="read-aloud__speed" role="group" aria-label="Reading speed">
                                <span className="read-aloud__speed-label">Speed</span>
                                {TTS_SPEEDS.map((sp) => (
                                    <button type="button" key={sp} aria-pressed={(speeds[pickerLang] || 1) === sp}
                                        className={`read-aloud__speed-btn${(speeds[pickerLang] || 1) === sp ? ' on' : ''}`}
                                        onClick={() => pickSpeed(pickerLang, sp)}>
                                        {sp}×
                                    </button>
                                ))}
                            </div>
                            <div className="read-aloud__lang">
                                <button type="button" className={`read-aloud__voice${!chosen[pickerLang] ? ' on' : ''}`}
                                    onClick={() => pick(pickerLang, '')}>Auto</button>
                                {(voices[pickerLang] || []).map((v) => (
                                    <button type="button" key={v.name}
                                        className={`read-aloud__voice${chosen[pickerLang] === v.name ? ' on' : ''}`}
                                        onClick={() => pick(pickerLang, v.name)}>
                                        {v.label}
                                        {v.gender && <span className={`voice-pick__gender voice-pick__gender--${v.gender}`}>{v.gender}</span>}
                                    </button>
                                ))}
                                {!voices[pickerLang] && <div className="read-aloud__none">Loading voices…</div>}
                                {voices[pickerLang] && voices[pickerLang].length === 0 && (
                                    <div className="read-aloud__none">No voices found</div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </span>

            {error && <span className="read-aloud__error">{error}</span>}
        </span>
    );
}

export default ReadAloud;
