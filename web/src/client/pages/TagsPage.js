import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import { fetchAllTags } from '../actions';
import { tagPath, tagItemPath } from '../utils/tagPaths';

// Browse your tagged items by tag. A tag's name (its pill, or its heading)
// opens that tag's own view, which works like a notebook (TagViewPage); a
// note or word opens there too, so ⌃ ⌄ step through the rest of the tag.
// No Quiz here: tags cover all kinds of notes, not only language learning
// (quizzes live on notebooks).
function TagsPage({ allTags, fetchAllTags }) {
    useEffect(() => { fetchAllTags(); }, [fetchAllTags]);

    const items = Array.isArray(allTags) ? allTags : [];
    const byTag = {};
    items.forEach((it) => (it.tags || []).forEach((t) => { (byTag[t] = byTag[t] || []).push(it); }));
    const tagNames = Object.keys(byTag).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });

    return (
        <div className="cb-account">
            <div className="cb-account__head"><h1 className="cb-page-title">Tags</h1></div>

            {allTags === null ? null : tagNames.length === 0 ? (
                <div className="cb-empty">
                    No tags yet — add a tag to a word or a note and it shows up here.
                </div>
            ) : (
                <>
                    <div className="tags-cloud">
                        <span className="tag-pill on">All</span>
                        {tagNames.map((t) => (
                            <Link key={t} className="tag-pill" to={tagPath(t)}>
                                {t}<span className="tag-pill__count">{byTag[t].length}</span>
                            </Link>
                        ))}
                    </div>

                    <div className="tags-sections">
                        {tagNames.map((t) => (
                            <div key={t} className="tags-section">
                                <Link className="tags-section__label" to={tagPath(t)}>{t}</Link>
                                <div className="tags-section__items">
                                    {[...byTag[t]].sort(byTitle).map((it) => (
                                        <Link key={`${it.type}#${it.id}`} to={tagItemPath(t, it)}
                                            className={`tags-item tags-item--${it.type}`}>
                                            <i className={`${it.type === 'card' ? 'sticky note outline' : 'font'} icon`}
                                                aria-hidden="true"></i>
                                            <span className="tags-item__title">{it.title}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function mapStateToProps({ allTags }) {
    return { allTags };
}

export default connect(mapStateToProps, { fetchAllTags })(requireAuth(TagsPage));
