import React, { useEffect, useState } from 'react';
import ttsPlayer from '../utils/ttsPlayer';
import { TTS_LANGUAGES } from '../utils/tts';
import { loadVoices, SAMPLE_TEXT } from '../utils/ttsVoices';

// "Voice for selected text" (from the editor's 🗣 menu). A dialog on desktop,
// a bottom sheet on phones (the shared .cb-sheet styles).
//
//   Language        which language the text is read in
//   Language default / a voice   with its male/female tag
//   ▶               hear that voice read the selected text (or a short
//                   sample when nothing is selected) before applying
//
// onApply(lang, voiceName | null): null is the language's default voice.
export default function VoicePickerDialog({ open, initialLang, initialVoice, sampleText, onApply, onClose }) {
    const [lang, setLang] = useState(initialLang || 'en-US');
    const [voice, setVoice] = useState(initialVoice || null);
    const [voices, setVoices] = useState(null); // null while loading
    const [player, setPlayer] = useState(ttsPlayer.snapshot());
    const [previewing, setPreviewing] = useState(null); // voice name, or '' for the default

    useEffect(() => ttsPlayer.subscribe(setPlayer), []);

    // Start from the selection's current language and voice each time.
    useEffect(() => {
        if (!open) return;
        setLang(initialLang || 'en-US');
        setVoice(initialVoice || null);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
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

    const sample = (sampleText || '').trim().slice(0, 200) || SAMPLE_TEXT[lang] || SAMPLE_TEXT['en-US'];

    // Must start in the click itself (ttsPlayer.prime) for iOS to allow audio.
    const preview = (name) => {
        const playingThis = player.sourceId === 'voice-preview' && previewing === (name || '') && player.status !== 'idle';
        if (playingThis) { ttsPlayer.stop(); return; }
        setPreviewing(name || '');
        ttsPlayer.prime();
        ttsPlayer.play([{ text: sample, lang, voice: name || undefined }], { title: 'Voice preview', sourceId: 'voice-preview' });
    };

    const previewIcon = (name) => {
        const mine = player.sourceId === 'voice-preview' && previewing === (name || '');
        if (mine && player.status === 'loading') return 'spinner loading';
        if (mine && player.status === 'playing') return 'stop';
        return 'play';
    };

    const row = (name, label, gender) => (
        <div key={name || 'default'} className={`voice-pick__row${voice === name ? ' on' : ''}`}>
            <label className="voice-pick__choice">
                <input type="radio" name="voice" checked={voice === name} onChange={() => setVoice(name)} />
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
            <div className="cb-sheet voice-pick" role="dialog" aria-modal="true" aria-label="Voice for selected text"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <h3 className="cb-sheet__title">Voice for selected text</h3>

                <label className="voice-pick__lang">
                    Language
                    <select value={lang} onChange={(e) => { setLang(e.target.value); setVoice(null); }}>
                        {TTS_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                </label>

                <div className="voice-pick__list">
                    {row(null, 'Language default', '')}
                    {voices === null && <div className="voice-pick__note">Loading voices…</div>}
                    {voices && voices.length === 0 && <div className="voice-pick__note">No voices found.</div>}
                    {voices && voices.map((v) => row(v.name, v.label, v.gender))}
                </div>

                <div className="cb-sheet__actions">
                    <button type="button" className="cb-btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="cb-btn cb-btn--accent" onClick={() => onApply(lang, voice)}>Apply</button>
                </div>
            </div>
        </div>
    );
}
