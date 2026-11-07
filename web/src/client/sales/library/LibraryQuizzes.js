import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchQuizzes, deleteQuiz } from '../../actions';
import ConfirmDialog from '../../components/ConfirmDialog';
import Spinner from '../../components/Spinner';
import { openQuiz, onQuizzesChanged } from '../../utils/quizLauncher';
import { useLibrary } from './LibraryShell';

// My quizzes, in the buyer's library: the quizzes the buyer saved (the
// quiz's Save button) from their bought notebooks. A saved quiz is the
// buyer's own copy of the cards (api/quizzes.js), so deleting one never
// touches the notebook.
//
// The same list as the app's My Quizzes (pages/QuizzesPage.js), limited to
// quizzes from bought notebooks (on localhost your own account has others).
export default function LibraryQuizzes() {
    const dispatch = useDispatch();
    const { productFor } = useLibrary();
    const [quizzes, setQuizzes] = useState(null); // null: loading
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(null);

    const load = useCallback(() => {
        dispatch(fetchQuizzes())
            .then((list) => { setQuizzes(list); setError(''); })
            .catch(() => { setQuizzes((q) => q || []); setError('Couldn’t load your quizzes. Check your connection.'); });
    }, [dispatch]);
    useEffect(() => { load(); }, [load]);
    // Saved or changed in the quiz itself.
    useEffect(() => onQuizzesChanged(load), [load]);

    const mine = (quizzes || []).filter((quiz) => productFor(quiz.notebook));

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
        } catch (err) {
            setError(`Couldn’t delete “${quiz.name}”. Check your connection and try again.`);
        }
    };

    return (
        <>
            <h1 className="lib-title">My quizzes</h1>
            {error && <p className="sales-note-error">{error}</p>}
            {quizzes === null ? (
                <Spinner label="Loading quizzes…" />
            ) : mine.length === 0 ? (
                <div className="lib-empty">
                    <p>No saved quizzes yet. Open a notebook, tap Quiz, and tap Save to keep a quiz here.</p>
                </div>
            ) : (
                <ul className="quiz-list">
                    {mine.map((quiz) => (
                        <li key={quiz.id} className="quiz-list__row">
                            <button type="button" className="quiz-list__open" onClick={() => start(quiz)}>
                                <span className="quiz-list__name">{quiz.name}</span>
                                <span className="quiz-list__meta">
                                    {quiz.cards.length} card{quiz.cards.length === 1 ? '' : 's'} · from {productFor(quiz.notebook).title}
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
                message="The quiz is removed from My quizzes. The notebook stays as it is."
                confirmLabel="Delete"
                tone="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </>
    );
}
