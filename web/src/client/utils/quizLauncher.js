// Opens the quiz from anywhere. The quiz (components/NotebookQuiz.js) is drawn
// once, at the app's root (App.js), not inside a page, so it lives on while
// the user moves around: opening a card's note leaves the page the quiz was
// started on, and "Back to quiz" returns to the same card.
//
// Pages start a quiz with openQuiz(); the quiz listens with onOpenQuiz().
// The same small "publish / subscribe" idea as utils/ttsPlayer.js.

const openListeners = new Set();
const changeListeners = new Set();

/**
 * Start a quiz (replacing one already open).
 *
 * @param {object} quiz
 * @param {string} quiz.title     shown on the direction sheet ("Spanish", "Spanish verbs")
 * @param {string} quiz.notebook  the notebook the cards came from ("From" links open notes there)
 * @param {() => Promise<{cards: object[], missing: number}>|{cards, missing}} quiz.load
 *        the cards: made from the notes, or a saved quiz's copy
 * @param {{id: string, name: string}} [quiz.saved] set for a quiz from My Quizzes
 */
export function openQuiz(quiz) {
    openListeners.forEach((fn) => fn(quiz));
}

/** The quiz listens for openQuiz(). Returns a function that stops listening. */
export function onOpenQuiz(fn) {
    openListeners.add(fn);
    return () => openListeners.delete(fn);
}

/** A saved quiz was saved or changed (My Quizzes reloads its list). */
export function quizzesChanged() {
    changeListeners.forEach((fn) => fn());
}

export function onQuizzesChanged(fn) {
    changeListeners.add(fn);
    return () => changeListeners.delete(fn);
}

/** A new saved quiz's id, made here so a quiz saved offline has one already ("q-…"). */
export const newQuizId = () => `q-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
