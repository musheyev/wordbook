import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import { fetchAllTags, fetchWordData, fetchItemNotebooks } from '../actions';
import { itemPath } from '../utils/notebookPaths';

// Browse your tagged items by tag. Words open on the Words page; notes open in
// the first notebook that contains them.
function TagsPage({ allTags, fetchAllTags, fetchWordData, fetchItemNotebooks }) {
    const navigate = useNavigate();
    const [active, setActive] = useState(null); // selected tag, or null = all
    const [error, setError] = useState('');

    useEffect(() => { fetchAllTags(); }, [fetchAllTags]);

    const items = Array.isArray(allTags) ? allTags : [];
    const byTag = {};
    items.forEach((it) => (it.tags || []).forEach((t) => { (byTag[t] = byTag[t] || []).push(it); }));
    const tagNames = Object.keys(byTag).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const open = async (it) => {
        setError('');
        if (it.type === 'word') {
            fetchWordData(it.id);
            navigate('/');
            return;
        }
        try {
            const books = await fetchItemNotebooks(it.id);
            if (books && books.length) {
                navigate(itemPath(books[0], { type: 'card', id: it.id }));
            } else {
                setError('That note isn’t in any notebook, so there’s nowhere to open it.');
            }
        } catch (err) {
            setError('Could not open that note.');
        }
    };

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
                        <button type="button" className={`tag-pill${active === null ? ' on' : ''}`}
                            onClick={() => setActive(null)}>All</button>
                        {tagNames.map((t) => (
                            <button key={t} type="button" className={`tag-pill${active === t ? ' on' : ''}`}
                                onClick={() => setActive(t)}>
                                {t}<span className="tag-pill__count">{byTag[t].length}</span>
                            </button>
                        ))}
                    </div>

                    {error && <div className="cb-sheet__error tags-error">{error}</div>}

                    <div className="tags-sections">
                        {(active ? [active] : tagNames).map((t) => (
                            <div key={t} className="tags-section">
                                <div className="tags-section__label">{t}</div>
                                <div className="tags-section__items">
                                    {byTag[t].map((it) => (
                                        <button key={`${it.type}#${it.id}`} type="button"
                                            className={`tags-item tags-item--${it.type}`} onClick={() => open(it)}>
                                            <i className={`${it.type === 'card' ? 'sticky note outline' : 'font'} icon`}
                                                aria-hidden="true"></i>
                                            <span className="tags-item__title">{it.title}</span>
                                        </button>
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

export default connect(mapStateToProps, { fetchAllTags, fetchWordData, fetchItemNotebooks })(requireAuth(TagsPage));
