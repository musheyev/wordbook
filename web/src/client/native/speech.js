// Spoken quiz answers (iPhone app only): JavaScript's side of the app's
// "SpeechAnswer" plugin (mobile/ios/App/App/SpeechAnswerPlugin.swift), which
// uses Apple's own speech recognition — on the phone itself where the
// iPhone can, so nothing is sent anywhere and it works offline.
//
// On the website there's no plugin, and canAnswerBySpeech() is false: the
// quiz shows no microphone there (browsers' speech recognition sends your
// voice to Apple's or Google's servers).
import { isNativeApp } from './platform';

// The plugin, wrapped in an object: a Capacitor plugin answers *any* method
// name, "then" too, so returning it bare from an async function (or
// awaiting it) would treat it as a promise and call SpeechAnswer.then().
let plugin = null;
async function speechPlugin() {
    if (!plugin) {
        const { registerPlugin } = await import('@capacitor/core');
        plugin = { speech: registerPlugin('SpeechAnswer') };
    }
    return plugin;
}

// Testing in a browser, from the developer console (like offlineTest,
// offline/network.js), with no microphone:
//
//   speechTest.on()               the quiz shows 🎤, as in the app
//   speechTest.next('I am tired') what the next 🎤 "hears"
//   speechTest.off()              back to the normal website
//
// The replies the app would say ("Correct") go to the console instead.
const TEST_KEY = 'speech-test';
const testing = () => { try { return !isNativeApp() && localStorage.getItem(TEST_KEY) === '1'; } catch (e) { return false; } };
let testHeard = '';
if (typeof window !== 'undefined') {
    window.speechTest = {
        on() { try { localStorage.setItem(TEST_KEY, '1'); } catch (e) { /* no storage */ } },
        off() { try { localStorage.removeItem(TEST_KEY); } catch (e) { /* no storage */ } },
        next(text) { testHeard = String(text || ''); },
    };
}

/** Whether this is the iPhone app, where the quiz can hear answers. */
export const canAnswerBySpeech = () => isNativeApp() || testing();

/**
 * Hear one answer. Ends by itself when you pause (or stopListening()).
 *
 * @param {string} lang the language to listen for, e.g. "es-ES", "en-US"
 * @param {string[]} hints words to expect (the card's answer): the
 *   recogniser favours them, which helps with short foreign phrases
 * @param {(text: string) => void} [onPartial] the words so far, as you speak
 * @returns {Promise<string>} what was heard ('' for nothing)
 * @throws {{code: 'DENIED'|'UNAVAILABLE'|'UNIMPLEMENTED'}} not allowed,
 *   language not supported, or an older app build without the plugin
 */
export async function listenForAnswer(lang, hints, onPartial) {
    if (testing()) { // speechTest: "hear" what speechTest.next() was given
        await new Promise((r) => setTimeout(r, 400));
        const text = testHeard;
        testHeard = '';
        return text;
    }
    const { speech } = await speechPlugin();
    const sub = onPartial ? await speech.addListener('partial', (e) => onPartial(e.text || '')) : null;
    try {
        const result = await speech.listen({ lang, hints });
        return (result && result.text) || '';
    } finally {
        if (sub) sub.remove();
    }
}

/** Stop listening now; the waiting listenForAnswer() gets what was heard. */
export async function stopListening() {
    if (testing()) return;
    const { speech } = await speechPlugin();
    await speech.stop();
}

/**
 * Say a short reply ("Correct") with the iPhone's built-in voice.
 * @param {string} text
 * @param {string} [lang]
 */
export async function sayReply(text, lang = 'en-US') {
    if (testing()) { console.log(`[speechTest] says: ${text}`); return; } // eslint-disable-line no-console
    try {
        const { speech } = await speechPlugin();
        await speech.speak({ text, lang });
    } catch (e) { /* the reply is on screen too */ }
}

/**
 * A short buzz in the hand (iPhone app): "success" for a right answer,
 * "error" for a wrong one, "light" for a small tap. Does nothing on the
 * website or in an older app build without it.
 * @param {'success'|'error'|'light'} kind
 */
export async function feel(kind) {
    if (!isNativeApp()) return;
    try {
        const { speech } = await speechPlugin();
        await speech.feel({ kind });
    } catch (e) { /* an older app build, or no vibration motor */ }
}
