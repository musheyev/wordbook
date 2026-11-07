import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchNoteLinks } from '../actions';
import { noteLinkHref } from '../utils/noteLinks';

// "Linked from" at the bottom of a note, or under a word (SearchResult.js):
// the notes that link to this one. Shown only when there are some:
//
//   ─────────────────────────────────────────────
//   Linked from   📝 Lesson 3   📝 Travel phrases
//
// (The notes this one links to are in the row beside its tags:
// NoteLinksRow.js.) Each one is an ordinary note link, so a tap opens it
// with "‹ Back to …" (components/NoteLinks.js). The list comes from the
// server, which records every note's links (api/note-links.js); it couldn't
// be worked out from the note alone.

/**
 * @param {object} props
 * @param {'card'|'word'} props.type
 * @param {string} props.id
 * @param {string} [props.version] changes when the note is saved (its content), to reload the lists
 */
export default function NoteLinkLists({ type, id, version }) {
    const dispatch = useDispatch();
    const [links, setLinks] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLinks(null);
        dispatch(fetchNoteLinks(type, id))
            .then((result) => { if (!cancelled) setLinks(result); })
            // Offline and not downloaded, say: the lists just aren't shown.
            .catch(() => { if (!cancelled) setLinks(null); });
        return () => { cancelled = true; };
    }, [type, id, version]);

    if (!links || links.linkedFrom.length === 0) return null;

    const row = (label, list) => list.length > 0 && (
        <div className="note-links__row">
            <span className="note-links__label">{label}</span>
            <span className="note-links__items">
                {list.map((item) => (item.missing ? (
                    <span key={`${item.type}:${item.id}`} className="note-links__missing" title="That note was deleted">
                        deleted note
                    </span>
                ) : (
                    <a key={`${item.type}:${item.id}`} href={noteLinkHref(item.type, item.id)}>{item.title || 'Untitled'}</a>
                )))}
            </span>
        </div>
    );

    return (
        <div className="note-links" aria-label="Notes that link here">
            {row('Linked from', links.linkedFrom)}
        </div>
    );
}
