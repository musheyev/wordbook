import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { fetchItemTags, setItemTags } from '../actions';

// Tag editor for the current item (a word or a note). Shows its tags as chips
// with a remove control, plus an input to add one. Cuts across notebooks.
function ItemTags({ type, id, title, itemTags, fetchItemTags, setItemTags }) {
    const [input, setInput] = useState('');

    useEffect(() => {
        if (id) fetchItemTags(type, id);
        setInput('');
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
                <span key={t} className="item-tag">
                    {t}
                    <button type="button" className="item-tag__x" aria-label={`Remove tag ${t}`}
                        onClick={() => remove(t)}>×</button>
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
