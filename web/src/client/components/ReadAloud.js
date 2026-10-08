import React, { useEffect, useRef, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { getChosenVoices, setChosenVoice, TTS_LANGUAGES } from '../utils/tts';

let uid = 0;

// Available voices per language, fetched once.
const voicesCache = {};
async function loadVoices(lang) {
    if (voicesCache[lang]) return voicesCache[lang];
    try {
        const res = await fetch(`/api/tts/voices?lang=${encodeURIComponent(lang)}`, { credentials: 'same-origin' });
        const data = await res.json();
        voicesCache[lang] = (data.voices || []).map((v) => v.name);
    } catch (e) {
        voicesCache[lang] = [];
    }
    return voicesCache[lang];
}

// Prefer the most natural voices (Chirp 3 HD), then Neural2, then WaveNet.
function rankVoices(names) {
    const rank = (n) => (n.includes('Chirp3-HD') ? 0 : n.includes('Chirp') ? 1 : n.includes('Neural2') ? 2 : n.includes('Wavenet') ? 3 : 4);
    return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

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
        const names = rankVoices(await loadVoices(lang));
        setVoices((prev) => ({ ...prev, [lang]: names }));
    };

    const openMenu = () => {
        const next = !menuOpen;
        setMenuOpen(next);
        if (next) showLang(pickerLang);
    };

    const pick = (lang, name) => { setChosenVoice(lang, name); setChosen(getChosenVoices()); };

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
                                            {l.label}{chosen[l.code] ? ' •' : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="read-aloud__lang">
                                <button type="button" className={`read-aloud__voice${!chosen[pickerLang] ? ' on' : ''}`}
                                    onClick={() => pick(pickerLang, '')}>Auto</button>
                                {(voices[pickerLang] || []).map((name) => (
                                    <button type="button" key={name}
                                        className={`read-aloud__voice${chosen[pickerLang] === name ? ' on' : ''}`}
                                        onClick={() => pick(pickerLang, name)}>
                                        {name.replace(`${pickerLang}-`, '')}
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
