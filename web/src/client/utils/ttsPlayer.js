// A single shared audio player for read-aloud. Plays a queue of chunks (each a
// sentence/language-run) by fetching MP3s from /api/tts and chaining them on one
// reused <audio> element, so playback continues in the background / on the iOS
// lock screen and shows Media Session controls (play/pause, back/forward).
//
// Going back and forward (seekBy, the big controls in PlayerPanel and the
// lock screen; 5 or 10 seconds, see SKIP_CHOICES) works in seconds of
// listening, across sentences: back from
// the start of a sentence continues into the end of the one before. The
// last few sentences' audio stays in memory (KEEP_BEHIND) so that's instant.
import { getChosenVoices, getChosenSpeeds, htmlToChunks } from './tts';

let audioEl = null;
function getAudio() {
    if (!audioEl) {
        audioEl = new Audio();
        audioEl.preload = 'auto';
    }
    return audioEl;
}

// A silent clip, built at runtime. A tiny one, played inside the click
// handler, "unlocks" the audio element so iOS lets us set a real src after the
// async fetch (which would otherwise be blocked as not user-initiated).
// Longer ones are a note's pauses (chunks { pause: seconds }): silence keeps
// the reading going on a locked phone, where simply waiting could stop it,
// and ±5 seconds works inside a pause like in a sentence.
function silentUrl(seconds = 0.05) {
    const sr = 8000;
    const n = Math.floor(sr * seconds);
    const buf = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    wr(36, 'data'); view.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// The voice a chunk is read in: a voice chosen for that text in the note
// (chunk.voice), else this device's choice for its language, else Google's
// default for the language (undefined).
// Sentences behind the current one whose audio is kept for going back.
const KEEP_BEHIND = 8;

// How far back/forward jumps (the big controls' Skip choice, and the lock
// screen), remembered on this device.
export const SKIP_CHOICES = [5, 10];
const SKIP_KEY = 'player-skip-seconds';
const readSkip = () => {
    try { const v = Number(localStorage.getItem(SKIP_KEY)); return SKIP_CHOICES.includes(v) ? v : 5; } catch (e) { return 5; }
};

// Resolves once the audio element knows the length of what's loaded.
const whenLoaded = (a) => new Promise((resolve) => {
    if (a.readyState >= 1 && Number.isFinite(a.duration)) { resolve(); return; }
    const done = () => { a.removeEventListener('loadedmetadata', done); a.removeEventListener('error', done); resolve(); };
    a.addEventListener('loadedmetadata', done);
    a.addEventListener('error', done);
});

const voiceFor = (chunk) => chunk.voice || getChosenVoices()[chunk.lang] || undefined;

const asRequest = (chunk) => ({ text: chunk.text, languageCode: chunk.lang, voiceName: voiceFor(chunk) });

/**
 * Tell the server which audio an item uses now (api/tts-refs.js), so audio it
 * no longer uses (after an edit, a language or voice change) can be cleaned
 * up by an admin. Best effort: a failure only means that audio isn't cleaned
 * up yet. `chunks` are the item's chunks exactly as they'd be read.
 *
 * @param {string} item e.g. "card:<card_id>"
 * @param {Array} chunks
 */
export function reportItemAudio(item, chunks) {
    if (!item) return;
    fetch('/api/tts/item', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ item, chunks: chunks.filter((c) => !c.pause).map(asRequest) }),
    }).catch(() => {});
}

// After saving a note (or a word's own note): its audio list as of now.
export const reportNoteAudio = (item, html) => reportItemAudio(item, htmlToChunks(html));

// Report every item a reading covers (chunks tagged with tagItem).
function reportItems(chunks) {
    const byItem = new Map();
    chunks.forEach((c) => {
        if (!c.item) return;
        if (!byItem.has(c.item)) byItem.set(c.item, []);
        byItem.get(c.item).push(c);
    });
    byItem.forEach((list, item) => reportItemAudio(item, list));
}

async function fetchChunkUrl(chunk) {
    if (chunk.pause) return silentUrl(chunk.pause);
    const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(asRequest(chunk)),
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
        this._urls = new Map(); // chunk index -> audio (blob URL) kept in memory
        this._durations = new Map(); // chunk index -> seconds of audio
        this.skip = readSkip(); // seconds back/forward jumps
        this._pendingSeek = 0; // jumps tapped while a sentence was loading
        // Whether the listener wants it playing (Play) or not (Pause).
        // `status` can say "loading" or briefly "paused" while moving to
        // another sentence, so jumps go by this instead.
        this._wantPlay = false;
        this._unlocked = false;
        this._bound = false;
    }

    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    snapshot() {
        // index/total count sentences ("3 of 12"), not pauses; during a
        // pause, index is the sentence before it.
        const spoken = (list) => list.filter((c) => !c.pause).length;
        return {
            status: this.status, sourceId: this.sourceId, title: this.title, error: this.error, skip: this.skip,
            index: Math.max(0, spoken(this.queue.slice(0, this.idx + 1)) - 1), total: spoken(this.queue),
        };
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
        reportItems(this.queue);
        this._wantPlay = true;
        this._bind();
        this._setSessionHandlers();
        await this._playIdx(0);
    }

    // Play chunk i, from `startAt` seconds into its audio; `play: false`
    // loads it and stays paused (going back while paused). `holdJumps`:
    // the caller applies jumps tapped meanwhile itself (seekBy, which still
    // has to set the position).
    async _playIdx(i, { startAt = 0, play = true, holdJumps = false } = {}) {
        if (i < 0 || i >= this.queue.length) { this.stop(); return; }
        this.idx = i;
        const chunk = this.queue[i];
        if (chunk.title) this.title = chunk.title;
        this.status = 'loading';
        this._emit();

        let url = this._urls.get(i);
        try {
            if (!url) {
                url = (this._prefetch && this._prefetch.idx === i)
                    ? await this._prefetch.promise
                    : await fetchChunkUrl(chunk);
            }
            if (!url) throw new Error('no audio');
        } catch (err) {
            this.error = err.status === 503
                ? 'Read-aloud isn’t set up on the server yet.'
                : 'Could not play audio.';
            this.status = 'idle'; this.sourceId = null; this._emit();
            return;
        }
        // Another chunk was asked for while this one loaded (fast taps).
        if (this.idx !== i) return;

        this._urls.set(i, url);
        this._forgetFarBehind();
        const a = getAudio();
        a.src = url;
        // The chunk's speed (e.g. slower Spanish). Set after
        // `src`: loading a new file resets the rate to defaultPlaybackRate, so
        // both are set. Pitch stays natural while slowed.
        // A speed set on the text in the note wins over the language's.
        const speed = chunk.speed || getChosenSpeeds()[chunk.lang] || 1;
        a.defaultPlaybackRate = speed;
        a.playbackRate = speed;
        a.preservesPitch = true;
        a.webkitPreservesPitch = true;
        a.mozPreservesPitch = true;
        await whenLoaded(a);
        if (this.idx !== i) return;
        if (Number.isFinite(a.duration)) this._durations.set(i, a.duration);
        if (startAt > 0) a.currentTime = Math.min(startAt, Math.max(0, (a.duration || startAt) - 0.05));
        if (!play) this.status = 'paused';
        else {
            try { await a.play(); this.status = 'playing'; } catch (e) { this.status = 'paused'; this._wantPlay = false; }
        }
        this._updateSession();
        this._emit();
        this._prefetchNext();
        if (!holdJumps) this._applyPendingSeek();
    }

    // Jumps tapped while the sentence loaded count once it's ready.
    _applyPendingSeek() {
        const s = this._pendingSeek;
        this._pendingSeek = 0;
        if (s) this.seekBy(s);
    }

    setSkip(seconds) {
        if (!SKIP_CHOICES.includes(seconds)) return;
        this.skip = seconds;
        try { localStorage.setItem(SKIP_KEY, String(seconds)); } catch (e) { /* not remembered */ }
        this._emit();
    }

    _prefetchNext() {
        const n = this.idx + 1;
        if (n >= this.queue.length || this._urls.has(n)) { this._prefetch = null; return; }
        if (this._prefetch && this._prefetch.idx === n) return;
        // An earlier fetch that was never played (we went back past it).
        const old = this._prefetch;
        if (old && !this._urls.has(old.idx)) old.promise.then((u) => u && URL.revokeObjectURL(u)).catch(() => {});
        this._prefetch = { idx: n, promise: fetchChunkUrl(this.queue[n]).catch(() => null) };
    }

    _advance() { if (this.idx + 1 < this.queue.length) this._playIdx(this.idx + 1); else this.stop(); }
    next() { if (this.idx + 1 < this.queue.length) this._playIdx(this.idx + 1); }
    prev() { if (this.idx > 0) this._playIdx(this.idx - 1); }

    /**
     * Go back (negative) or forward by `seconds` of listening. At 0.6× speed,
     * 5 seconds covers less of the text than at 1×. Crosses into the
     * sentences before or after; forward past the last sentence ends the
     * reading. Paused stays paused.
     */
    async seekBy(seconds) {
        if (this.idx < 0 || this.status === 'idle') return;
        if (this.status === 'loading') { this._pendingSeek += seconds; return; }
        const a = getAudio();
        const play = this._wantPlay;
        const rate = (i) => this.queue[i].speed || getChosenSpeeds()[this.queue[i].lang] || 1;
        const duration = Number.isFinite(a.duration) ? a.duration : (this._durations.get(this.idx) || 0);
        const target = a.currentTime + seconds * rate(this.idx);

        if (target >= 0 && target < duration) { a.currentTime = target; this._updateSession(); return; }

        if (target < 0) {
            // Listening seconds still to go back, through earlier sentences
            // (their lengths are known: they were played).
            let left = -target / rate(this.idx);
            let i = this.idx - 1;
            while (i >= 0) {
                const len = (this._durations.get(i) || 0) / rate(i);
                if (left <= len || i === 0) {
                    const into = Math.max(0, len - left) * rate(i);
                    await this._playIdx(i, { startAt: into, play });
                    return;
                }
                left -= len;
                i -= 1;
            }
            a.currentTime = 0; // the first sentence: back to its start
            return;
        }

        // Forward past this sentence: into the next ones (their lengths are
        // only known once loaded, so _playIdx carries what's left over).
        let left = (target - duration) / rate(this.idx);
        let i = this.idx + 1;
        while (i < this.queue.length) {
            await this._playIdx(i, { play: false, holdJumps: true });
            if (this.idx !== i || this.status === 'idle') return;
            const len = (this._durations.get(i) || 0) / rate(i);
            if (left < len || i === this.queue.length - 1) {
                getAudio().currentTime = Math.min(left, len) * rate(i);
                if (play) await this.resume(); else this._emit();
                this._applyPendingSeek();
                return;
            }
            left -= len;
            i += 1;
        }
        this.stop();
    }

    pause() { this._wantPlay = false; getAudio().pause(); this.status = 'paused'; this._updateSession(); this._emit(); }
    resume() {
        this._wantPlay = true;
        return getAudio().play().then(() => { this.status = 'playing'; this._updateSession(); this._emit(); }).catch(() => {});
    }
    toggle() {
        if (this.status === 'playing') this.pause();
        else if (this.status === 'paused') this.resume();
    }

    stop(emit = true) {
        if (audioEl) { audioEl.pause(); try { audioEl.removeAttribute('src'); audioEl.load(); } catch (e) {} }
        this._urls.forEach((u) => URL.revokeObjectURL(u));
        this._urls.clear();
        this._durations.clear();
        this._pendingSeek = 0;
        this._wantPlay = false;
        if (this._prefetch) { this._prefetch.promise.then((u) => u && URL.revokeObjectURL(u)).catch(() => {}); this._prefetch = null; }
        this.queue = []; this.idx = -1; this.status = 'idle'; this.sourceId = null;
        this._clearSession();
        if (emit) this._emit();
    }

    // Free the audio of sentences far behind (and any skipped ahead of).
    _forgetFarBehind() {
        this._urls.forEach((u, i) => {
            if (i < this.idx - KEEP_BEHIND || i > this.idx + 1) { URL.revokeObjectURL(u); this._urls.delete(i); }
        });
    }

    _setSessionHandlers() {
        if (!('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch (e) {} };
        set('play', () => this.resume());
        set('pause', () => this.pause());
        set('stop', () => this.stop());
        // Back/forward on the lock screen and headphones, by the chosen Skip
        // (the phone's own suggested amount is ignored). Phones show either
        // these or previous/next sentence, not both, so sentence skipping
        // is turned off.
        set('seekbackward', () => this.seekBy(-this.skip));
        set('seekforward', () => this.seekBy(this.skip));
        set('previoustrack', null);
        set('nexttrack', null);
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
