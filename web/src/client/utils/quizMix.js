// A Mixed quiz (NotebookQuiz.js): some cards are asked Spanish → English,
// the rest English → Spanish, in the share the quiz was started with:
//
//   70 / 30   mostly Spanish → English, an occasional English → Spanish
//   50 / 50   half each way
//   30 / 70   mostly English → Spanish
//
// "Dealing" decides each card's direction. The count follows the share
// exactly (24 cards at 70 / 30: 17 one way, 7 the other), and the less
// common direction is spread through the quiz rather than bunched: the
// cards are cut into as many equal stretches as there are of it, and one
// card in each stretch, picked at random, gets it. So 70 / 30 never gives
// seven English → Spanish cards in a row, but isn't a fixed pattern either.
//
// A saved quiz (My Quizzes) keeps its deal on the phone, one per share, so
// coming back asks each card the same way; Start over deals again.
//
//   localStorage "quiz-mix:<quiz id>:<share>"   { "<card key>": true, … }
//   (true: Spanish → English, answer in English)
//
// The share last picked is remembered on this device ("quiz.mixShare").
import { cardKey } from './quizResults';

/** The shares offered, as the part asked Spanish → English (to English). */
export const MIX_SHARES = [70, 50, 30];
const DEFAULT_SHARE = 70;
const SHARE_PREF = 'quiz.mixShare';

/** The share picked last time on this device (70 when none was). */
export function lastShare() {
    try {
        const v = Number(localStorage.getItem(SHARE_PREF));
        return MIX_SHARES.includes(v) ? v : DEFAULT_SHARE;
    } catch (e) {
        return DEFAULT_SHARE;
    }
}

/** Remember the share for next time. */
export function rememberShare(share) {
    try { localStorage.setItem(SHARE_PREF, String(share)); } catch (e) { /* private window: not remembered */ }
}

/**
 * Deal each card a direction.
 *
 * @param {Array} cards the quiz's cards, in order
 * @param {number} share 0–100: the part asked Spanish → English
 * @param {() => number} random a number in [0, 1) (Math.random; fixed in tests)
 * @returns {Object<string, boolean>} by card key: true = Spanish → English
 */
export function dealDirections(cards, share, random = Math.random) {
    const n = cards.length;
    const toEnglish = Math.round((n * share) / 100);
    // The less common direction is the one spread out (at 50 / 50, either).
    const fewerIsEnglish = toEnglish < n - toEnglish;
    const fewer = fewerIsEnglish ? toEnglish : n - toEnglish;
    const picked = new Set();
    for (let k = 0; k < fewer; k++) {
        const from = Math.floor((k * n) / fewer);
        const to = Math.floor(((k + 1) * n) / fewer); // exclusive
        picked.add(from + Math.floor(random() * (to - from)));
    }
    const deal = {};
    cards.forEach((card, i) => {
        deal[cardKey(card)] = picked.has(i) ? fewerIsEnglish : !fewerIsEnglish;
    });
    return deal;
}

const mixKey = (saved, share) => (saved ? `quiz-mix:${saved.id}:${share}` : null);

/**
 * A saved quiz's deal for this share, with any card it doesn't cover dealt
 * now (so it's always complete); a fresh deal for an unsaved quiz.
 */
export function loadDeal(saved, share, cards) {
    let deal = null;
    const key = mixKey(saved, share);
    if (key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            if (value && typeof value === 'object') deal = value;
        } catch (e) { /* unreadable: deal again */ }
    }
    if (!deal) return dealDirections(cards, share);
    const missing = cards.filter((c) => typeof deal[cardKey(c)] !== 'boolean');
    return missing.length ? { ...dealDirections(missing, share), ...deal } : deal;
}

/** Keep a saved quiz's deal for this share (nothing for an unsaved one). */
export function saveDeal(saved, share, deal) {
    const key = mixKey(saved, share);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(deal)); } catch (e) { /* storage full: dealt again next time */ }
}
