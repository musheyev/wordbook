import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchNoteLinks, saveAddedNoteLinks } from '../actions';
import { noteLinkHref } from '../utils/noteLinks';
import NoteLinkPicker from './NoteLinkPicker';

// A note's links, in the row beside its tags (SearchResult.js):
//
//   🏷 Spanish ×  Add tag        🔗 📝 Spanish verbs ×   Aa hablar ×   Add link
//
// "Add link" (admins) opens the same search as the old editor menu
// (NoteLinkPicker.js) and adds the chosen note or word; × removes it. These
// links are kept with the note on the server (api/note-links.js,
// setAddedLinks), not in its text. Links that are written in the note's
// text are shown here too, without × (to remove one, edit the text).
//
// Each chip is an ordinary note link, so a tap opens it with "‹ Back to …"
// (components/NoteLinks.js), and the quiz on a note and its links counts
// them (actions: quizCardsForLinked).

/**
 * @param {object} props
 * @param {'card'|'word'} props.type
 * @param {string} props.id
 * @param {string} props.title the note's title (a word: the word)
 * @param {string} [props.version] changes when the note is saved, to reload its links
 */
export default function NoteLinksRow({ type, id, title, version }) {
    const dispatch = useDispatch();
    const isAdmin = useSelector((state) => state.isAdmin);
    const [links, setLinks] = useState(null); // null: loading (or offline and not downloaded)
    const [picking, setPicking] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLinks(null);
        setError('');
        dispatch(fetchNoteLinks(type, id))
            .then((result) => { if (!cancelled) setLinks(result.linksTo); })
            .catch(() => { if (!cancelled) setLinks(null); });
        return () => { cancelled = true; };
    }, [type, id, version]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!links || (!isAdmin && links.length === 0)) return null;

    const added = links.filter((l) => l.added);
    const same = (a, b) => a.type === b.type
        && (a.type === 'word' ? String(a.id).toLowerCase() === String(b.id).toLowerCase() : a.id === b.id);

    // Save the added links; the row then shows what the server has.
    const save = (next) => {
        setError('');
        dispatch(saveAddedNoteLinks({ type, id, title }, next))
            .then((result) => setLinks(result.linksTo))
            .catch(() => setError('Couldn’t save the link. Check your connection and try again.'));
    };
    const add = (item) => {
        setPicking(false);
        if (same(item, { type, id }) || links.some((l) => same(l, item) && l.added)) return; // itself, or added already
        save([...added, { type: item.type, id: item.id }]);
    };
    const remove = (item) => save(added.filter((l) => !same(l, item)));

    return (
        <div className="item-links" aria-label="Linked notes">
            <i className="linkify icon" aria-hidden="true"></i>
            {links.map((l) => (
                <span key={`${l.type}:${l.id}`} className="item-link"
                    title={l.added ? undefined : 'A link in the note’s text (edit the note to remove it)'}>
                    {l.missing
                        ? <span className="item-link__missing">deleted note</span>
                        : <a href={noteLinkHref(l.type, l.id)}>{l.title || 'Untitled'}</a>}
                    {isAdmin && l.added && (
                        <button type="button" className="item-tag__x" aria-label={`Remove link to ${l.title || 'this note'}`}
                            onClick={() => remove(l)}>×</button>
                    )}
                </span>
            ))}
            {isAdmin && (
                <button type="button" className="item-links__add" onClick={() => setPicking(true)}>
                    {links.length ? 'Add link' : 'Add a link'}
                </button>
            )}
            {error && <span className="item-links__error">{error}</span>}
            {isAdmin && <NoteLinkPicker open={picking} onClose={() => setPicking(false)} onPick={add} />}
        </div>
    );
}
