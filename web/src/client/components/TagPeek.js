import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAllTags } from '../actions';
import { tagPath, tagItemPath, itemsWithTag } from '../utils/tagPaths';

// The small list that drops down from a tag on a note (ItemTags): the other
// notes and words with the same tag, A to Z, each opening in the tag's view
// (TagViewPage), so ⌃ ⌄ there step through the rest. "Open tag view" at the
// bottom opens the tag's list itself.
//
// The tagged items come from the store's allTags, loaded here the first
// time (later saves keep it current, allTagsReducer). Closes on a click
// outside, on Escape, and when one of its links is followed.

// More than this many and the list stops, with "and N more"; the tag view
// has them all.
const SHOWN = 12;

/**
 * @param {object} props
 * @param {string} props.tag
 * @param {{type: string, id: string}} props.current the item the tag is on (left out)
 * @param {() => void} props.onClose
 */
export default function TagPeek({ tag, current, onClose }) {
    const dispatch = useDispatch();
    const allTags = useSelector((state) => state.allTags);

    useEffect(() => { if (allTags === null) dispatch(fetchAllTags()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const others = itemsWithTag(allTags, tag).filter((it) => !(it.type === current.type && it.id === current.id));
    const more = others.length - SHOWN;

    return (
        <>
            <span className="tag-peek__backdrop" onMouseDown={onClose} />
            <div className="tag-peek" role="dialog" aria-label={`Also tagged ${tag}`}>
                <div className="tag-peek__head">Also tagged {tag}</div>
                {allTags === null ? (
                    <div className="tag-peek__empty">Loading…</div>
                ) : others.length === 0 ? (
                    <div className="tag-peek__empty">Nothing else has this tag yet.</div>
                ) : (
                    <div className="tag-peek__list">
                        {others.slice(0, SHOWN).map((it) => (
                            <Link key={`${it.type}#${it.id}`} className="tag-peek__row"
                                to={tagItemPath(tag, it)} onClick={onClose}>
                                <i className={`${it.type === 'card' ? 'sticky note outline' : 'font'} icon`}
                                    aria-hidden="true"></i>
                                <span className="tag-peek__title">{it.title}</span>
                            </Link>
                        ))}
                        {more > 0 && <div className="tag-peek__more">and {more} more</div>}
                    </div>
                )}
                <Link className="tag-peek__all" to={tagPath(tag)} onClick={onClose}>
                    Open tag view<i className="arrow right icon" aria-hidden="true"></i>
                </Link>
            </div>
        </>
    );
}
