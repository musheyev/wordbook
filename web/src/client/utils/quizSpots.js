// Unfinished quizzes (NotebookQuiz.js): where you left off, so the quiz's
// sheet can offer "Continue where you left off" next time.
//
// One spot per place a quiz is started from (openQuiz's `spot`):
//
//   "nb:<notebook>"         a notebook's Quiz or Quiz selected
//   "tag:<tag>"             a tag's Quiz (Tags)
//   "note:<type>:<id>"      a note's Quiz (the note and its links)
//   "saved:<quiz id>"       a quiz in My Quizzes
//
// Starting a new quiz from the same place replaces its spot; finishing the
// last round clears it. Spots don't expire. They're kept on this device
// only (localStorage), like the quiz's other remembered things.
//
//   localStorage "quiz-spot:<spot>" {
//     cards,           the quiz's cards, as asked (some of them, or written ones)
//     index,           the card you were on (a position in `cards`)
//     summary,         the round whose summary showed (null: none)
//     direction, share, deal, run,   which way each card goes, your answers
//     kind, written,   what the questions are (QUIZ_KINDS), written by the model
//     saved,           the saved quiz it is ({ id, name }; null: not saved)
//     subset,          only some of a saved quiz's cards
//     at,              when (ms), to drop the oldest if the phone is full
//   }
//
// A big notebook's spot is a few dozen KB. If localStorage is full, the
// oldest spots are dropped to make room (and if that's not enough, this one
// isn't kept: the quiz itself carries on).

const PREFIX = 'quiz-spot:';

/**
 * Where you left off in the quiz started from `spot`, or null.
 * @param {string|undefined} spot
 */
export function loadSpot(spot) {
    if (!spot) return null;
    try {
        const v = JSON.parse(localStorage.getItem(PREFIX + spot));
        return v && Array.isArray(v.cards) && v.cards.length && Number.isInteger(v.index) ? v : null;
    } catch (e) {
        return null;
    }
}

/** The spots kept, oldest first: [{ key, at }]. */
function allSpots() {
    const out = [];
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PREFIX)) {
                let at = 0;
                try { at = JSON.parse(localStorage.getItem(key)).at || 0; } catch (e) { /* unreadable: oldest */ }
                out.push({ key, at });
            }
        }
    } catch (e) { /* storage blocked */ }
    return out.sort((a, b) => a.at - b.at);
}

/**
 * Keep where you are in the quiz started from `spot`.
 * @param {string|undefined} spot
 * @param {object} state see the top of this file (`at` is added here)
 */
export function saveSpot(spot, state) {
    if (!spot) return;
    let text;
    try { text = JSON.stringify({ ...state, at: Date.now() }); } catch (e) { return; }
    const key = PREFIX + spot;
    const older = allSpots().filter((s) => s.key !== key);
    for (;;) {
        try {
            localStorage.setItem(key, text);
            return;
        } catch (e) {
            // Full (or blocked): drop the oldest other spot and try again.
            const oldest = older.shift();
            if (!oldest) return;
            try { localStorage.removeItem(oldest.key); } catch (err) { return; }
        }
    }
}

/** Forget the spot: the quiz was finished. */
export function clearSpot(spot) {
    if (!spot) return;
    try { localStorage.removeItem(PREFIX + spot); } catch (e) { /* storage blocked */ }
}
