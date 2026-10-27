import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import { fetchQuizzes, deleteQuiz } from '../actions';
import { openQuiz, onQuizzesChanged } from '../utils/quizLauncher';

// My Quizzes (/quizzes; admins for now, linked from More and the desktop
// rail). The quizzes saved from a quiz's Save button, newest change first:
//
//   Spanish verbs                              🗑
//   24 cards · from Spanish · Oct 27
//
// Tap a quiz to start it (the direction sheet first, as from a notebook).
// 🗑 deletes it, after asking; the notes it came from aren't touched. A saved
// quiz is a copy of its cards (api/quizzes.js), so it opens without loading
// the notes, and offline from the phone's saved list.

const dateOf = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
};

function QuizzesPage() {
    const dispatch = useDispatch();
    const [quizzes, setQuizzes] = useState(null); // null: loading
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(null); // the quiz being asked about

    const load = useCallback(() => {
        dispatch(fetchQuizzes())
            .then((list) => { setQuizzes(list); setError(''); })
            .catch(() => { setQuizzes((q) => q || []); setError('Couldn’t load your quizzes. Check your connection.'); });
    }, [dispatch]);

    useEffect(() => { load(); }, [load]);
    // A quiz saved or changed elsewhere (the quiz itself, after Remove).
    useEffect(() => onQuizzesChanged(load), [load]);

    const start = (quiz) => openQuiz({
        title: quiz.name,
        notebook: quiz.notebook,
        load: () => ({ cards: quiz.cards, missing: 0 }),
        saved: { id: quiz.id, name: quiz.name },
    });

    const confirmDelete = async () => {
        const quiz = deleting;
        setDeleting(null);
        try {
            await dispatch(deleteQuiz(quiz.id));
            setQuizzes((list) => list.filter((q) => q.id !== quiz.id));
            setError('');
        } catch (err) {
            setError(`Couldn’t delete “${quiz.name}”. Check your connection and try again.`);
        }
    };

    return (
        <div className="cb-account">
            <div className="cb-account__head"><h1 className="cb-page-title">My Quizzes</h1></div>

            {error && <div className="cb-sheet__error">{error}</div>}

            {quizzes === null ? (
                <Spinner label="Loading quizzes…" />
            ) : quizzes.length === 0 ? (
                <div className="cb-empty">
                    No saved quizzes yet. Start a quiz from a notebook and tap Save to keep it here.
                </div>
            ) : (
                <ul className="quiz-list">
                    {quizzes.map((quiz) => (
                        <li key={quiz.id} className="quiz-list__row">
                            <button type="button" className="quiz-list__open" onClick={() => start(quiz)}>
                                <span className="quiz-list__name">{quiz.name}</span>
                                <span className="quiz-list__meta">
                                    {quiz.cards.length} card{quiz.cards.length === 1 ? '' : 's'}
                                    {quiz.notebook ? ` · from ${quiz.notebook}` : ''}
                                    {dateOf(quiz.updatedAt) ? ` · ${dateOf(quiz.updatedAt)}` : ''}
                                </span>
                            </button>
                            <button type="button" className="quiz-list__delete" aria-label={`Delete ${quiz.name}`}
                                title="Delete this quiz" onClick={() => setDeleting(quiz)}>
                                <i className="trash alternate outline icon" aria-hidden="true"></i>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog
                open={!!deleting}
                title={deleting ? `Delete “${deleting.name}”?` : ''}
                message="The quiz is removed from My Quizzes. Your notes stay as they are."
                confirmLabel="Delete"
                tone="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
}

export default requireAuth(QuizzesPage);
