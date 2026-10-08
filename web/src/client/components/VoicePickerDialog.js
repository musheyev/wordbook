import React, { useEffect, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { TTS_LANGUAGES, TTS_SPEEDS, textToChunks } from '../utils/tts';
import { loadVoices, SAMPLE_TEXT } from '../utils/ttsVoices';

// "Read selected text as" (the editor's 🗣 menu → "Voice and speed…"). A
// dialog on desktop, a bottom sheet on phones (the shared .cb-sheet styles).
//
//   Language   Automatic (English, or Hebrew by its letters) or a language
//   Speed      Default (the language's speed from read-aloud's ⌄ menu) or
//              a speed for just this text
//   voices     Language default, or a voice with its male/female tag
//   ▶          hear the selected text (or a short sample) as it would be
//              read, before applying
//
// onApply({ lang, voice, speed }): lang null = Automatic, voice null = the
// language's default voice, speed null = Default.
export default function VoicePickerDialog({ open, initialLang, initialVoice, initialSpeed, sampleText, onApply, onClose }) {
    const [lang, setLang] = useState(initialLang || null);
    const [voice, setVoice] = useState(initialVoice || null);
    const [speed, setSpeed] = useState(initialSpeed || null);
    const [voices, setVoices] = useState(null); // null while loading
    const [player, setPlayer] = useState(ttsPlayer.snapshot());
    const [previewing, setPreviewing] = useState(null); // voice name, or '' for the default

    useEffect(() => ttsPlayer.subscribe(setPlayer), []);

    // Start from the selection's current settings each time.
    useEffect(() => {
        if (!open) return;
        setLang(initialLang || null);
        setVoice(initialVoice || null);
        setSpeed(initialSpeed || null);
    }, [open]);

    useEffect(() => {
        if (!open || !lang) return undefined;
        let cancelled = false;
        setVoices(null);
        loadVoices(lang).then((list) => { if (!cancelled) setVoices(list); });
        return () => { cancelled = true; };
    }, [open, lang]);

    // Stop any preview when the dialog closes.
    useEffect(() => {
        if (!open && player.sourceId === 'voice-preview') ttsPlayer.stop();
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const sample = (sampleText || '').trim().slice(0, 200) || SAMPLE_TEXT[lang || 'en-US'] || SAMPLE_TEXT['en-US'];

    // Must start in the click itself (ttsPlayer.prime) for iOS to allow audio.
    const preview = (name) => {
        const playingThis = player.sourceId === 'voice-preview' && previewing === (name || '') && player.status !== 'idle';
        if (playingThis) { ttsPlayer.stop(); return; }
        setPreviewing(name || '');
        const chunks = (lang ? [{ text: sample, lang, voice: name || undefined }] : textToChunks(sample))
            .map((c) => (speed ? { ...c, speed } : c));
        ttsPlayer.prime();
        ttsPlayer.play(chunks, { title: 'Preview', sourceId: 'voice-preview' });
    };

    const previewIcon = (name) => {
        const mine = player.sourceId === 'voice-preview' && previewing === (name || '');
        if (mine && player.status === 'loading') return 'spinner loading';
        if (mine && player.status === 'playing') return 'stop';
        return 'play';
    };

    const row = (name, label, gender, selectable = true) => (
        <div key={name || 'default'} className={`voice-pick__row${selectable && voice === name ? ' on' : ''}`}>
            <label className="voice-pick__choice">
                {selectable && <input type="radio" name="voice" checked={voice === name} onChange={() => setVoice(name)} />}
                <span className="voice-pick__name">{label}</span>
                {gender && <span className={`voice-pick__gender voice-pick__gender--${gender}`}>{gender}</span>}
            </label>
            <button type="button" className="voice-pick__play" aria-label={`Preview ${label}`} title="Preview"
                onClick={() => preview(name)}>
                <i className={`${previewIcon(name)} icon`} aria-hidden="true"></i>
            </button>
        </div>
    );

    return (
        <div className="cb-sheet__overlay" onMouseDown={onClose}>
            <div className="cb-sheet voice-pick" role="dialog" aria-modal="true" aria-label="Read selected text as"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <h3 className="cb-sheet__title">Read selected text as</h3>

                <label className="voice-pick__lang">
                    Language
                    <select value={lang || ''} onChange={(e) => { setLang(e.target.value || null); setVoice(null); }}>
                        <option value="">Automatic (English / Hebrew)</option>
                        {TTS_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                </label>

                <div className="voice-pick__speed" role="group" aria-label="Speed">
                    <span className="voice-pick__speed-label">Speed</span>
                    <button type="button" aria-pressed={!speed}
                        className={`read-aloud__speed-btn${!speed ? ' on' : ''}`} onClick={() => setSpeed(null)}>Default</button>
                    {TTS_SPEEDS.map((sp) => (
                        <button type="button" key={sp} aria-pressed={speed === sp}
                            className={`read-aloud__speed-btn${speed === sp ? ' on' : ''}`} onClick={() => setSpeed(sp)}>
                            {sp}×
                        </button>
                    ))}
                </div>

                <div className="voice-pick__list">
                    {!lang ? (
                        <>
                            {row(null, 'Automatic voices', '', false)}
                            <div className="voice-pick__note">Choose a language to pick a specific voice.</div>
                        </>
                    ) : (
                        <>
                            {row(null, 'Language default', '')}
                            {voices === null && <div className="voice-pick__note">Loading voices…</div>}
                            {voices && voices.length === 0 && <div className="voice-pick__note">No voices found.</div>}
                            {voices && voices.map((v) => row(v.name, v.label, v.gender))}
                        </>
                    )}
                </div>

                <div className="cb-sheet__actions">
                    <button type="button" className="cb-btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="cb-btn cb-btn--accent"
                        onClick={() => onApply({ lang, voice: lang ? voice : null, speed })}>Apply</button>
                </div>
            </div>
        </div>
    );
}
