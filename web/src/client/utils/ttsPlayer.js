// A single shared audio player for read-aloud. Plays a queue of chunks (each a
// sentence/language-run) by fetching MP3s from /api/tts and chaining them on one
// reused <audio> element, so playback continues in the background / on the iOS
// lock screen and shows Media Session controls (play/pause/next/prev).
import { getChosenVoices } from './tts';

let audioEl = null;
function getAudio() {
    if (!audioEl) {
        audioEl = new Audio();
        audioEl.preload = 'auto';
    }
    return audioEl;
}

// A tiny silent clip, built at runtime. Playing it inside the click handler
// "unlocks" the audio element so iOS lets us set a real src after the async
// fetch (which would otherwise be blocked as not user-initiated).
function silentUrl() {
    const sr = 8000;
    const n = Math.floor(sr * 0.05);
    const buf = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    wr(36, 'data'); view.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

async function fetchChunkUrl(chunk) {
    const voices = getChosenVoices();
    const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: chunk.text, languageCode: chunk.lang, voiceName: voices[chunk.lang] }),
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => '');
        const err = new Error(msg || 'TTS request failed');
        err.status = res.status;
        throw err;
    }
    return URL.createObjectURL(await res.blob());
}

class TtsPlayer {
    constructor() {
        this.queue = [];
        this.idx = -1;
        this.status = 'idle'; // idle | loading | playing | paused
        this.sourceId = null; // which UI element owns the current playback
        this.title = '';
        this.error = '';
        this.listeners = new Set();
        this._prefetch = null;
        this._currentUrl = null;
        this._unlocked = false;
        this._bound = false;
    }

    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    snapshot() {
        return { status: this.status, sourceId: this.sourceId, title: this.title, error: this.error, index: this.idx, total: this.queue.length };
    }
    _emit() { const s = this.snapshot(); this.listeners.forEach((fn) => fn(s)); }

    // Call synchronously from a click before any await, to satisfy iOS autoplay.
    prime() {
        const a = getAudio();
        if (this._unlocked) return;
        try {
            const url = silentUrl();
            a.src = url;
            const p = a.play();
            if (p && p.then) p.then(() => { this._unlocked = true; }).catch(() => {});
            else this._unlocked = true;
        } catch (e) { /* ignore */ }
    }

    _bind() {
        if (this._bound) return;
        const a = getAudio();
        a.addEventListener('ended', () => this._advance());
        a.addEventListener('error', () => { if (this.status !== 'idle') this._advance(); });
        this._bound = true;
    }

    async play(chunks, meta = {}) {
        this.stop(false);
        this.queue = Array.isArray(chunks) ? chunks : [];
        this.sourceId = meta.sourceId || null;
        this.title = meta.title || '';
        this.error = '';
        if (this.queue.length === 0) { this.status = 'idle'; this._emit(); return; }
        this._bind();
        this._setSessionHandlers();
        await this._playIdx(0);
    }

    async _playIdx(i) {
        if (i < 0 || i >= this.queue.length) { this.stop(); return; }
        this.idx = i;
        const chunk = this.queue[i];
        if (chunk.title) this.title = chunk.title;
        this.status = 'loading';
        this._emit();

        let url;
        try {
            url = (this._prefetch && this._prefetch.idx === i)
                ? await this._prefetch.promise
                : await fetchChunkUrl(chunk);
            if (!url) throw new Error('no audio');
        } catch (err) {
            this.error = err.status === 503
                ? 'Read-aloud isn’t set up on the server yet.'
                : 'Could not play audio.';
            this.status = 'idle'; this.sourceId = null; this._emit();
            return;
        }

        this._revokeCurrent();
        this._currentUrl = url;
        const a = getAudio();
        a.src = url;
        try { await a.play(); this.status = 'playing'; } catch (e) { this.status = 'paused'; }
        this._updateSession();
        this._emit();
        this._prefetchNext();
    }

    _prefetchNext() {
        const n = this.idx + 1;
        if (n >= this.queue.length) { this._prefetch = null; return; }
        this._prefetch = { idx: n, promise: fetchChunkUrl(this.queue[n]).catch(() => null) };
    }

    _advance() { if (this.idx + 1 < this.queue.length) this._playIdx(this.idx + 1); else this.stop(); }
    next() { if (this.idx + 1 < this.queue.length) this._playIdx(this.idx + 1); }
    prev() { if (this.idx > 0) this._playIdx(this.idx - 1); }

    pause() { getAudio().pause(); this.status = 'paused'; this._updateSession(); this._emit(); }
    resume() {
        getAudio().play().then(() => { this.status = 'playing'; this._updateSession(); this._emit(); }).catch(() => {});
    }
    toggle() {
        if (this.status === 'playing') this.pause();
        else if (this.status === 'paused') this.resume();
    }

    stop(emit = true) {
        if (audioEl) { audioEl.pause(); try { audioEl.removeAttribute('src'); audioEl.load(); } catch (e) {} }
        this._revokeCurrent();
        if (this._prefetch) { this._prefetch.promise.then((u) => u && URL.revokeObjectURL(u)).catch(() => {}); this._prefetch = null; }
        this.queue = []; this.idx = -1; this.status = 'idle'; this.sourceId = null;
        this._clearSession();
        if (emit) this._emit();
    }

    _revokeCurrent() { if (this._currentUrl) { URL.revokeObjectURL(this._currentUrl); this._currentUrl = null; } }

    _setSessionHandlers() {
        if (!('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch (e) {} };
        set('play', () => this.resume());
        set('pause', () => this.pause());
        set('stop', () => this.stop());
        set('previoustrack', () => this.prev());
        set('nexttrack', () => this.next());
    }
    _updateSession() {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.playbackState =
                this.status === 'playing' ? 'playing' : this.status === 'paused' ? 'paused' : 'none';
            if (window.MediaMetadata) {
                navigator.mediaSession.metadata = new window.MediaMetadata({
                    title: this.title || 'Reading', artist: 'Remembrancer',
                });
            }
        } catch (e) { /* ignore */ }
    }
    _clearSession() {
        if (!('mediaSession' in navigator)) return;
        try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
}

const ttsPlayer = new TtsPlayer();
export default ttsPlayer;
