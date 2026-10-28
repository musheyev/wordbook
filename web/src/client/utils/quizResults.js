// A quiz run's spoken answers (NotebookQuiz.js, iPhone app): which cards
// were answered and whether rightly, for the Score (correct ÷ answered ×
// 100). Kept on the phone only, not on the account.
//
// A saved quiz (My Quizzes) keeps its run here between visits, one per
// direction (Spanish → English and English → Spanish are different
// tests), until Start over. An unsaved quiz has no key: its run lasts only
// while it's open.
//
//   localStorage "quiz-run:<quiz id>:<to-en|from-en>"
//     { "<card key>": { heard: "I am", correct: true }, … }

const PREFIX = 'quiz-run:';

/**
 * The storage key for a quiz run, or null for one that isn't kept.
 * @param {{id: string}|null} saved the quiz in My Quizzes, if it's there
 * @param {boolean} toEnglish the direction: answering in English
 */
export const runKey = (saved, toEnglish) => (saved ? `${PREFIX}${saved.id}:${toEnglish ? 'to-en' : 'from-en'}` : null);

/** A card's identity within a quiz (its two sides). */
export const cardKey = (card) => `${card.foreign.text}\u0001${card.english.text}`;

/**
 * @param {string|null} key from runKey
 * @returns {Object<string, {heard: string, correct: boolean}>}
 */
export function loadRun(key) {
    if (!key) return {};
    try {
        const value = JSON.parse(localStorage.getItem(key) || '{}');
        return value && typeof value === 'object' ? value : {};
    } catch (e) {
        return {};
    }
}

/**
 * @param {string|null} key from runKey
 * @param {Object} run the answers so far ({} clears it)
 */
export function saveRun(key, run) {
    if (!key) return;
    try {
        if (Object.keys(run).length) localStorage.setItem(key, JSON.stringify(run));
        else localStorage.removeItem(key);
    } catch (e) { /* storage full or blocked: the run still lasts while the quiz is open */ }
}

/**
 * The score of a run over the quiz's current cards (removed cards don't count).
 * @param {Object} run
 * @param {Array} cards
 * @returns {{answered: number, correct: number, total: number, score: number|null}}
 *   score 0–100, or null when nothing's answered yet
 */
export function scoreOf(run, cards) {
    let answered = 0;
    let correct = 0;
    cards.forEach((card) => {
        const result = run[cardKey(card)];
        if (!result) return;
        answered += 1;
        if (result.correct) correct += 1;
    });
    return { answered, correct, total: cards.length, score: answered ? Math.round((correct / answered) * 100) : null };
}
