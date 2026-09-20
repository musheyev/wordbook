import React, { useState, useEffect, useMemo } from 'react';
import { connect } from 'react-redux';
import {
    addItemToWordbook, removeItemFromWordbook, addWordbook, fetchWordbooks,
} from '../actions';

// Cardbook membership picker. Desktop: a popover anchored under the bookmark
// icon. Mobile: a bottom sheet (CSS-driven off the same markup). Each cardbook
// is a one-tap toggle; the ones the item already belongs to are checked.
//
// Two modes:
//   live (default) — the item is a saved word/card (the current selection);
//                    toggling persists immediately.
//   staged         — a brand-new, unsaved card; toggling only updates the
//                    parent's `selected` list, applied when the card is saved.
//                    `lockedName` (the cardbook being viewed) is always included.
function AddToCardbook({
    align = 'right', onClose,
    staged = false, selected = [], onToggle, lockedName = '',
    wordbooks, wordWorkbooks,
    addItemToWordbook, removeItemFromWordbook, addWordbook, fetchWordbooks,
}) {
    const [filter, setFilter] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');

    useEffect(() => { fetchWordbooks(); }, [fetchWordbooks]);

    const names = useMemo(
        () => [...(wordbooks || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        [wordbooks]
    );
    const visible = names.filter((n) => n.toLowerCase().includes(filter.trim().toLowerCase()));

    const isIn = (name) => {
        if (name === lockedName) return true;
        return staged ? selected.includes(name) : (wordWorkbooks || []).includes(name);
    };

    const toggle = (name) => {
        if (name === lockedName) return; // always included, can't be removed
        if (staged) {
            onToggle(name);
        } else if ((wordWorkbooks || []).includes(name)) {
            removeItemFromWordbook(name);
        } else {
            addItemToWordbook(name);
        }
    };

    const submitNew = async (e) => {
        e.preventDefault();
        const name = newName.trim();
        if (name === '') return;
        await addWordbook(name);
        // Put the item into the freshly created cardbook right away.
        if (staged) onToggle(name);
        else addItemToWordbook(name);
        setNewName('');
        setShowNew(false);
    };

    return (
        <div className={`a2c a2c--${align}`}>
            <div className="a2c__backdrop" onMouseDown={onClose} />
            <div className="a2c__panel" onMouseDown={(e) => e.stopPropagation()}>
                <div className="a2c__head">
                    <span className="a2c__title">Add to cardbook</span>
                    <button type="button" className="a2c__close" aria-label="Close" onClick={onClose}>
                        <i className="times icon"></i>
                    </button>
                </div>

                {names.length > 6 && (
                    <div className="a2c__filter">
                        <i className="search icon"></i>
                        <input type="text" placeholder="Filter cardbooks"
                            value={filter} onChange={(e) => setFilter(e.target.value)} />
                    </div>
                )}

                <div className="a2c__list">
                    {visible.length === 0 ? (
                        <div className="a2c__empty">
                            {names.length === 0 ? 'No cardbooks yet.' : 'No cardbooks match.'}
                        </div>
                    ) : visible.map((name) => {
                        const on = isIn(name);
                        const locked = name === lockedName;
                        return (
                            <button type="button" key={name}
                                className={`a2c__row${on ? ' on' : ''}${locked ? ' locked' : ''}`}
                                onClick={() => toggle(name)}>
                                <span className="a2c__name">{name}</span>
                                {locked && <span className="a2c__tag">current</span>}
                                {on && <i className="check icon"></i>}
                            </button>
                        );
                    })}
                </div>

                <div className="a2c__foot">
                    {showNew ? (
                        <form className="a2c__new" onSubmit={submitNew}>
                            <input type="text" autoFocus placeholder="Cardbook name"
                                value={newName} onChange={(e) => setNewName(e.target.value)} />
                            <button type="submit" className="a2c__new-add">Add</button>
                        </form>
                    ) : (
                        <button type="button" className="a2c__newbtn" onClick={() => setShowNew(true)}>
                            <i className="plus icon"></i>
                            <span>New cardbook</span>
                        </button>
                    )}
                </div>

                {/* Shown on mobile (bottom sheet) only; desktop dismisses via × / click-out. */}
                <button type="button" className="a2c__done" onClick={onClose}>Done</button>
            </div>
        </div>
    );
}

function mapStateToProps({ wordbooks, wordWorkbooks }) {
    return { wordbooks, wordWorkbooks };
}

export default connect(mapStateToProps, {
    addItemToWordbook, removeItemFromWordbook, addWordbook, fetchWordbooks,
})(AddToCardbook);
