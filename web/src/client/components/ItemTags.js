import React, { useCallback, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { fetchItemTags, setItemTags } from '../actions';
import TagPeek from './TagPeek';

// Tag editor for the current item (a word or a note). Shows its tags as chips
// with a remove control, plus an input to add one. Cuts across notebooks.
// Clicking a tag's name drops down the other notes with that tag (TagPeek),
// with a way into the tag's own view.
function ItemTags({ type, id, title, itemTags, fetchItemTags, setItemTags }) {
    const [input, setInput] = useState('');
    // The tag whose list of other notes is open (TagPeek), if any.
    const [peek, setPeek] = useState(null);
    const closePeek = useCallback(() => setPeek(null), []);

    useEffect(() => {
        if (id) fetchItemTags(type, id);
        setInput('');
        setPeek(null);
    }, [type, id, fetchItemTags]);

    if (!id) return null;

    const tags = itemTags && itemTags.type === type && itemTags.id === id ? itemTags.tags : [];

    const add = (e) => {
        e.preventDefault();
        const t = input.trim();
        setInput('');
        if (t === '') return;
        if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
        setItemTags(type, id, [...tags, t], title);
    };

    const remove = (t) => setItemTags(type, id, tags.filter((x) => x !== t), title);

    return (
        <div className="item-tags">
            <i className="tags icon" aria-hidden="true"></i>
            {tags.map((t) => (
                <span key={t} className={`item-tag${peek === t ? ' on' : ''}`}>
                    <button type="button" className="item-tag__name" aria-expanded={peek === t}
                        title={`Notes also tagged ${t}`}
                        onClick={() => setPeek(peek === t ? null : t)}>
                        {t}
                    </button>
                    <button type="button" className="item-tag__x" aria-label={`Remove tag ${t}`}
                        onClick={() => remove(t)}>×</button>
                    {peek === t && <TagPeek tag={t} current={{ type, id }} onClose={closePeek} />}
                </span>
            ))}
            <form className="item-tags__add" onSubmit={add}>
                <input type="text" value={input} autoCapitalize="none" autoComplete="off"
                    placeholder={tags.length ? 'Add tag' : 'Add a tag'}
                    onChange={(e) => setInput(e.target.value)} onBlur={add} />
            </form>
        </div>
    );
}

function mapStateToProps({ itemTags }) {
    return { itemTags };
}

export default connect(mapStateToProps, { fetchItemTags, setItemTags })(ItemTags);
