import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useStore } from 'react-redux';
import { findNoteLinkNotebook } from '../actions';
import { itemPath } from '../utils/notebookPaths';
import {
    parseNoteLink, noteLinkHref, getTrail, onTrailChange, pushTrail, trailMovedTo, clearTrail,
} from '../utils/noteLinks';

// Following note links, and the way back (utils/noteLinks.js explains links
// and the trail). Drawn once, at the app's root (App.js), like the quiz.
//
// A tap on a note link anywhere a note is shown (a note, a word's note, a
// floating note window) opens the linked note in the app, in a notebook
// that has it, instead of a new browser tab. While editing, links aren't
// followed: a tap there puts the cursor in the text.
//
// On the page a link opened:
//
//            ┌──────────────────────────────┐
//            │ ‹ Back to "Lesson 3"     ✕   │
//            └──────────────────────────────┘
//
// Back returns to the note the link was in; ✕ just hides the pill. A note
// that can't be found says so briefly in the same place.

const MESSAGE_MS = 4000;

/**
 * What the page shows now, for "Back to …": the open note's title, or the
 * word. The store has it whichever page it is (a notebook or Words).
 */
function currentTitle(state) {
    if (state.currentWordType === 'card' && state.currentCard && state.currentCard.title) return state.currentCard.title;
    if (state.currentWordType === 'word' && state.currentWord) return state.currentWord;
    return '';
}

export default function NoteLinks() {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const store = useStore();
    const [trail, setTrail] = useState(getTrail);
    const [message, setMessage] = useState('');

    useEffect(() => onTrailChange(setTrail), []);

    // Moving anywhere else ends the trail (or steps it back: utils/noteLinks.js).
    useEffect(() => { trailMovedTo(location.pathname); }, [location.pathname]);

    // The click listener is added once; it reads the page it's on from here.
    const here = useRef(location);
    here.current = location;

    useEffect(() => {
        if (!message) return undefined;
        const timer = setTimeout(() => setMessage(''), MESSAGE_MS);
        return () => clearTimeout(timer);
    }, [message]);

    /** Open the note or word a link points to, remembering where it was followed from. */
    const follow = async (target) => {
        const from = here.current.pathname + here.current.search;
        const title = currentTitle(store.getState());
        let notebook = null;
        try {
            notebook = await dispatch(findNoteLinkNotebook(target));
        } catch (err) {
            setMessage('Couldn’t open that link. Check your connection and try again.');
            return;
        }
        let to;
        if (notebook) to = itemPath(notebook, target);
        // A word no notebook has any more still has its definitions (and your
        // note): its own page shows them (pages/NoteLinkPage.js).
        else if (target.type === 'word') to = noteLinkHref('word', target.id);
        else {
            setMessage('That note was deleted, or isn’t in any of your notebooks.');
            return;
        }
        setMessage('');
        pushTrail(from, title, to.split('?')[0]);
        navigate(to);
    };
    const followRef = useRef(follow);
    followRef.current = follow;

    // Taps on note links, caught before the browser opens them in a new tab
    // (the same way native/auth.js catches the login links). A click with
    // ⌘/Ctrl/Shift is left alone: a new tab or window, which opens the link's
    // own page.
    useEffect(() => {
        const onClick = (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const link = e.target.closest && e.target.closest('a[href^="/note/"]');
            if (!link || link.closest('[contenteditable="true"]')) return;
            const target = parseNoteLink(link.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            followRef.current(target);
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, []);

    const last = trail[trail.length - 1];
    if (message) {
        return <div className="link-back link-back--message" role="status">{message}</div>;
    }
    if (!last) return null;
    return (
        <div className="link-back" role="navigation" aria-label="Back to the note you came from">
            <button type="button" className="link-back__go" onClick={() => navigate(last.from)}>
                <i className="chevron left icon" aria-hidden="true"></i>
                <span className="link-back__label">
                    {last.title ? <>Back to “<span className="link-back__title">{last.title}</span>”</> : 'Back'}
                </span>
            </button>
            <button type="button" className="link-back__close" aria-label="Hide" title="Hide" onClick={clearTrail}>
                <i className="close icon" aria-hidden="true"></i>
            </button>
        </div>
    );
}
