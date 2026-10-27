import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchNoteLinks } from '../actions';
import { noteLinkHref } from '../utils/noteLinks';

// "Links to" and "Linked from" at the bottom of a note, or under a word
// (SearchResult.js). Shown only when there are some:
//
//   ─────────────────────────────────────────────
//   Links to      📝 Spanish verbs   Aa hablar
//   Linked from   📝 Lesson 3   📝 Travel phrases
//
// Each one is an ordinary note link, so a tap opens it with "‹ Back to …"
// (components/NoteLinks.js). The lists come from the server, which records
// every note's links when it's saved (api/note-links.js); "Linked from"
// couldn't be worked out from the note alone.

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

    if (!links || (links.linksTo.length === 0 && links.linkedFrom.length === 0)) return null;

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
        <div className="note-links" aria-label="Linked notes">
            {row('Links to', links.linksTo)}
            {row('Linked from', links.linkedFrom)}
        </div>
    );
}
