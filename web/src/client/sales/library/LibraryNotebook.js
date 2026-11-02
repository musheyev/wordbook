import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getCardContent, quizCardsForItems } from '../../actions';
import ReadAloud from '../../components/ReadAloud';
import Spinner from '../../components/Spinner';
import { colorOf } from '../../utils/itemColors';
import { cardChunks, firstSentenceChunks, getFirstSentenceOnly } from '../../utils/tts';
import { openQuiz } from '../../utils/quizLauncher';
import NotFoundPage from '../../pages/NotFoundPage';
import { useLibrary, libraryNotePath } from './LibraryShell';

// Play all / Quiz: seconds of silence between notes (as in the app).
const NOTE_GAP = 2;

// A bought notebook, in the buyer's library (/learn-spanish/library/<id>):
//
//   ‹ My notebooks
//   Getting Around
//   Beginner · 29 notes
//   [▶ Play all ⌄]  [? Quiz]
//   ┌ Where would I be able to get a taxi?          › ┐
//   │ ¿Dónde puedo tomar un taxi?                     │
//   └─────────────────────────────────────────────────┘
//   …
//
// Read only: no Add, Edit, Move, Select or sorting — the notes stay in the
// seller's order. A note's colour (the buyer's own) shows as a stripe.
export default function LibraryNotebook() {
    const { id } = useParams();
    const dispatch = useDispatch();
    const { findProduct, notebooks } = useLibrary();
    const itemColors = useSelector((state) => state.itemColors);
    const product = findProduct(id);
    if (!product) return <NotFoundPage />;
    const notebook = notebooks[product.id] || { status: 'loading' };
    const notes = notebook.status === 'ready' ? notebook.notes : [];

    // Every note read aloud, one after another (the app's Play all, with its
    // "First sentence of each" choice).
    const allChunks = async () => {
        const firstOnly = getFirstSentenceOnly();
        const out = [];
        for (const note of notes) {
            const content = await dispatch(getCardContent(note.id));
            let chunks = cardChunks({ card_id: note.id, content });
            if (firstOnly) chunks = firstSentenceChunks(chunks, content);
            if (!chunks.length) continue;
            if (out.length) out.push({ pause: NOTE_GAP });
            out.push(...chunks.map((c, i) => ({ ...c, title: i === 0 ? note.title : undefined })));
        }
        return out;
    };

    const quiz = () => openQuiz({
        title: product.title,
        notebook: product.notebook,
        load: () => dispatch(quizCardsForItems(notes)),
    });

    return (
        <>
            <Link to="/learn-spanish/library" className="sales-back">
                <i className="chevron left icon" aria-hidden="true"></i>My notebooks
            </Link>
            <h1 className="lib-title">{product.title}</h1>
            <p className="lib-meta">{product.level}{notebook.status === 'ready' ? ` · ${notes.length} notes` : ''}</p>

            {notebook.status === 'loading' && <Spinner label="Loading the notes…" />}
            {notebook.status === 'error' && <p className="sales-note-error">{notebook.message}</p>}
            {notes.length > 0 && (
                <>
                    <div className="lib-actions">
                        <ReadAloud getChunks={allChunks} title={product.title} label="Play all" firstSentence />
                        <button type="button" className="cb-btn cb-btn--ghost" onClick={quiz}>
                            <i className="question circle outline icon" aria-hidden="true"></i>Quiz
                        </button>
                    </div>
                    <ul className="lib-notes">
                        {notes.map((note) => {
                            const color = colorOf(itemColors, note);
                            return (
                                <li key={note.id}>
                                    <Link to={libraryNotePath(product, note.id)} className={`nb-row${color ? ' has-color' : ''}`}
                                        style={color ? { '--item-tint': color.tint, '--item-ink': color.ink } : undefined}>
                                        <span className="nb-row__icon nb-row__icon--card" aria-hidden="true">
                                            <i className="sticky note outline icon"></i>
                                        </span>
                                        <span className="nb-row__text">
                                            <span className="nb-row__title">{note.title}</span>
                                            <span className="nb-row__sub">{note.preview || 'Note'}</span>
                                        </span>
                                        <i className="chevron right icon nb-row__chev" aria-hidden="true"></i>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </>
    );
}
