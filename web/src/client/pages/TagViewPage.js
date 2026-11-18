import React, { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import {
    SET_CURRENT_WORDBOOK, fetchAllTags, fetchCardData, fetchWordData, clearCurrentSelection, closeCardEditor,
} from '../actions';
import SearchResult from '../components/SearchResult';
import CardEditorInline from '../components/CardEditorInline';
import RecentNotesButton from '../components/RecentNotesButton';
import Spinner from '../components/Spinner';
import { tagPath, tagItemPath, itemsWithTag } from '../utils/tagPaths';
import { setNoteNav } from '../utils/noteAudio';

// One tag, shown the way a notebook shows its items (utils/tagPaths.js):
//
//   /tag/<tag>                 the tag's notes and words, A to Z
//   /tag/<tag>/<type>/<id>     one of them open under a bar that goes back
//                              to the tag and steps ⌃ ⌄ through the rest
//
// A tag cuts across notebooks, so this page has no notebook of its own:
// nothing here adds a note (a new note needs a notebook to live in) and
// there's no Quiz (tags hold all kinds of notes, not only language ones).
// While an item is open, the side panel lists the tag's items (Header.js).
//
// The list comes from the store's allTags (every tagged item, loaded with
// fetchAllTags), the same list the Tags page groups.
function TagViewPage() {
    const { tag, type, id } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const allTags = useSelector((state) => state.allTags);
    const cardEditorOpen = useSelector((state) => state.cardEditor.open);
    const currentWord = useSelector((state) => state.currentWord);

    // No notebook is open here; tell the rest of the app so (e.g. deleting
    // a note doesn't reload some other notebook's list).
    useEffect(() => {
        dispatch({ type: SET_CURRENT_WORDBOOK, payload: '' });
        dispatch(closeCardEditor());
        dispatch(fetchAllTags());
    }, [tag, dispatch]);

    // Load the item named in the address, or clear the selection on the list.
    useEffect(() => {
        if (!id) dispatch(clearCurrentSelection());
        else if (type === 'card') dispatch(fetchCardData(id));
        else dispatch(fetchWordData(id));
        if (id) window.scrollTo(0, 0);
    }, [type, id, dispatch]);

    const items = itemsWithTag(allTags, tag);
    const index = id ? items.findIndex((it) => it.type === type && it.id === id) : -1;
    const goTo = (i) => navigate(tagItemPath(tag, items[i]), { replace: true });

    // The open note was deleted (deleteCard clears the selection): back to
    // the tag's list, with the list reloaded so it's gone from there too.
    const loadedRef = useRef('');
    useEffect(() => {
        if (id && currentWord === id) loadedRef.current = id;
        else if (id && loadedRef.current === id && currentWord === '' && !cardEditorOpen) {
            loadedRef.current = '';
            dispatch(fetchAllTags());
            navigate(tagPath(tag), { replace: true });
        }
    }, [id, currentWord, cardEditorOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ⏮ Note / Note ⏭ in the read-aloud controls (utils/noteAudio.js): the
    // tag's notes before and after this one, skipping words.
    useEffect(() => {
        if (type !== 'card' || index === -1) { setNoteNav(null); return undefined; }
        const notes = items.map((it, i) => (it.type === 'card' ? i : -1)).filter((i) => i !== -1);
        const before = notes.filter((i) => i < index);
        const after = notes.filter((i) => i > index);
        setNoteNav({
            prev: before.length ? () => goTo(before[before.length - 1]) : null,
            next: after.length ? () => goTo(after[0]) : null,
        });
        return () => setNoteNav(null);
    }, [type, id, index, allTags]); // eslint-disable-line react-hooks/exhaustive-deps

    let body;
    if (cardEditorOpen) {
        body = (
            <section id="worddefinition">
                <CardEditorInline />
            </section>
        );
    } else if (id) {
        body = (
            <>
                <div className="nb-back">
                    <Link className="nb-back__link" to={tagPath(tag)}>
                        <i className="chevron left icon" aria-hidden="true"></i>
                        <i className="tag icon tag-view__icon" aria-hidden="true"></i>
                        <span className="nb-back__name">{tag}</span>
                    </Link>
                    <div className="nb-back__nav">
                        <RecentNotesButton current={`${type}:${id}`} />
                        {index !== -1 && items.length > 1 && (
                            <>
                            <span className="nb-back__pos">{index + 1} of {items.length}</span>
                            <button type="button" className="nb-back__step" aria-label="Previous item"
                                disabled={index === 0} onClick={() => goTo(index - 1)}>
                                <i className="chevron up icon"></i>
                            </button>
                            <button type="button" className="nb-back__step" aria-label="Next item"
                                disabled={index === items.length - 1} onClick={() => goTo(index + 1)}>
                                <i className="chevron down icon"></i>
                            </button>
                            </>
                        )}
                    </div>
                </div>
                <section id="worddefinition">
                    <SearchResult />
                </section>
            </>
        );
    } else {
        body = (
            <div className="tag-view">
                <Link className="tag-view__back" to="/tags">
                    <i className="chevron left icon" aria-hidden="true"></i>Tags
                </Link>
                <h1 className="cb-page-title tag-view__title">
                    <i className="tag icon tag-view__icon" aria-hidden="true"></i>{tag}
                    {allTags !== null && <span className="tag-view__count">{items.length}</span>}
                </h1>
                {allTags === null ? (
                    <Spinner label="Loading…" />
                ) : items.length === 0 ? (
                    <div className="cb-empty">Nothing is tagged “{tag}” now.</div>
                ) : (
                    <div className="tag-view__list">
                        {items.map((it) => (
                            <Link key={`${it.type}#${it.id}`} className={`tags-item tags-item--${it.type}`}
                                to={tagItemPath(tag, it)}>
                                <i className={`${it.type === 'card' ? 'sticky note outline' : 'font'} icon`}
                                    aria-hidden="true"></i>
                                <span className="tags-item__title">{it.title}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`cb-detail${cardEditorOpen ? ' cb-detail--editing' : ''}${id ? ' cb-detail--item' : ''}`}>
            {body}
        </div>
    );
}

export default requireAuth(TagViewPage);
