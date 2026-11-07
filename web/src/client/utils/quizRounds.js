// A quiz in rounds (NotebookQuiz.js): 259 cards in one go is a lot, so
// they're asked 20 at a time, each round ending with its own summary (its
// score, the day streak, and the cards to review). A last round of fewer
// than 5 cards joins the one before it (so 43 cards are 20 + 23, not
// 20 + 20 + 3).
//
// The day streak: how many days in a row you've finished a round, counting
// today. Kept on this device only (localStorage "quiz.days": the days, as
// "2026-11-07", newest last, the last 400 at most).

export const ROUND_SIZE = 20;
const SMALLEST_LAST_ROUND = 5;
const DAYS_KEY = 'quiz.days';

/**
 * The rounds of a quiz of `count` cards, as [start, end) card positions.
 * @param {number} count
 * @returns {Array<[number, number]>}
 */
export function roundsOf(count) {
    const rounds = [];
    for (let start = 0; start < count; start += ROUND_SIZE) rounds.push([start, Math.min(start + ROUND_SIZE, count)]);
    if (rounds.length > 1 && rounds[rounds.length - 1][1] - rounds[rounds.length - 1][0] < SMALLEST_LAST_ROUND) {
        const [, end] = rounds.pop();
        rounds[rounds.length - 1][1] = end;
    }
    return rounds;
}

/**
 * Which round card `index` is in (0 for the first).
 * @param {Array<[number, number]>} rounds from roundsOf
 * @param {number} index
 */
export const roundAt = (rounds, index) => Math.max(0, rounds.findIndex(([start, end]) => index >= start && index < end));

// A day as "2026-11-07", in this device's time zone.
const dayOf = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

function loadDays() {
    try {
        const days = JSON.parse(localStorage.getItem(DAYS_KEY) || '[]');
        return Array.isArray(days) ? days : [];
    } catch (e) {
        return [];
    }
}

/** Note that a round was finished today. */
export function recordQuizDay(now = new Date()) {
    const today = dayOf(now);
    const days = loadDays();
    if (days[days.length - 1] === today) return;
    try {
        localStorage.setItem(DAYS_KEY, JSON.stringify([...days, today].slice(-400)));
    } catch (e) { /* storage full or blocked: no streak, the quiz still works */ }
}

/**
 * Days in a row with a finished round, ending today (or yesterday, when
 * today has none yet: the streak isn't broken until the day is over).
 * @returns {number}
 */
export function dayStreak(now = new Date()) {
    const days = new Set(loadDays());
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!days.has(dayOf(day))) day.setDate(day.getDate() - 1);
    let streak = 0;
    while (days.has(dayOf(day))) {
        streak += 1;
        day.setDate(day.getDate() - 1);
    }
    return streak;
}
