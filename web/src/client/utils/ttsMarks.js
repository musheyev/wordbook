// "Show read-aloud marks": whether notes being read (not edited) show how
// they're read aloud — language tints, don't-read text, ⏸ pauses and 🔖
// bookmarks — as the editor always does. Off by default; remembered on this
// device. It's a class on <html> (.tts-marks-on) that styles.css keys on, so
// every note on screen follows at once. Set from the read-aloud ⌄ menu
// (ReadAloud.js).
const KEY = 'show-tts-marks';

export function getShowTtsMarks() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}

export function setShowTtsMarks(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* this visit only */ }
    applyShowTtsMarks(on);
}

export function applyShowTtsMarks(on = getShowTtsMarks()) {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('tts-marks-on', !!on);
}
