import React from 'react';
import ReadAloud from './ReadAloud';

// Play selected: tick notes and words in a notebook (the desktop overview's
// cards or the phone list's rows) and read just those, in the order shown.
// The selection lives in WordbookPage (`selection`):
//   selecting      ticking is on (cards/rows tick instead of opening)
//   picked         Set of "<type>:<id>"
//   isPicked(item), toggle(item), setAll(items), start(), cancel()
//
//   3 selected   [▶ Play selected]   [Select all]   [Cancel]

export const keyOf = (item) => `${item.type}:${item.id}`;

// The bar shown while selecting. `shownItems`: what's on screen (Select all
// ticks those). `getChunks`: the read-aloud queue for the ticked items.
export function SelectBar({ selection, shownItems, getChunks, title }) {
    const n = selection.picked.size;
    const allPicked = shownItems.length > 0 && shownItems.every((item) => selection.isPicked(item));
    return (
        <div className="nb-selectbar" role="toolbar" aria-label="Selected items">
            <span className="nb-selectbar__count">{n === 0 ? 'Tick notes to play' : `${n} selected`}</span>
            {n > 0 ? (
                <ReadAloud getChunks={getChunks} title={title} label="Play selected" voices={false} />
            ) : (
                <button type="button" className="cb-btn cb-btn--ghost" disabled>
                    <i className="volume up icon" aria-hidden="true"></i>Play selected
                </button>
            )}
            <span className="nb-selectbar__spacer" />
            <button type="button" className="nb-selectbar__link"
                onClick={() => selection.setAll(allPicked ? [] : shownItems)}>
                {allPicked ? 'Select none' : 'Select all'}
            </button>
            <button type="button" className="nb-selectbar__link" onClick={selection.cancel}>Cancel</button>
        </div>
    );
}

// The tick box drawn on a card or row while selecting.
export function SelectCheck({ on }) {
    return (
        <span className={`nb-check${on ? ' is-on' : ''}`} aria-hidden="true">
            {on && <i className="check icon"></i>}
        </span>
    );
}
