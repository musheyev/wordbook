import { isNativeApp } from './platform';

// The iPhone keyboard inside the app (Capacitor's Keyboard plugin).
//
// iOS adds a bar above the keyboard with ^ ˅ (previous/next field) and ✓
// (Done) whenever a web page has a text field focused — the "form accessory
// bar". The note editor has its own toolbar there, so the extra bar only
// takes room. It's hidden once, at start-up (main.jsx). The website is left
// alone: there, Safari decides.
export function installNativeKeyboard() {
    if (!isNativeApp()) return;
    import('@capacitor/keyboard')
        .then(({ Keyboard }) => Keyboard.setAccessoryBarVisible({ isVisible: false }))
        .catch(() => { /* keeps the bar; nothing else depends on this */ });
}
