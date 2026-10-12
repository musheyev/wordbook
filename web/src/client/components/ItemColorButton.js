import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchItemColors, saveItemColors } from '../actions';
import { ITEM_COLORS, colorOf } from '../utils/itemColors';

// "● Color": give notes/words one of five pale colours, or none
// (utils/itemColors.js). On a note's or word's toolbar (`items` = that one
// item; the dot shows its colour) and in Select mode for the ticked items.
// Saved straight away, the same in every notebook.
export default function ItemColorButton({ items, label = 'Color', className = 'cb-btn cb-btn--ghost' }) {
    const dispatch = useDispatch();
    const colors = useSelector((state) => state.itemColors);
    const [open, setOpen] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => { if (colors == null) dispatch(fetchItemColors()); }, []);

    const current = items.length === 1 ? colorOf(colors, items[0]) : null;
    const pick = (key) => {
        setOpen(false);
        setFailed(false);
        dispatch(saveItemColors(items, key)).catch(() => setFailed(true));
    };

    return (
        <span className="item-color">
            <button type="button" className={`${className} item-color__btn`} disabled={!items.length}
                aria-haspopup="menu" aria-expanded={open} title="Give a colour"
                onClick={() => setOpen((v) => !v)}>
                <span className={`item-color__dot${current ? '' : ' item-color__dot--none'}`} aria-hidden="true"
                    style={current ? { background: current.ink } : undefined} />
                {failed ? 'Couldn’t save' : label}
            </button>
            {open && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="cb-menu__list item-color__menu" role="menu">
                        <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => pick(null)}>
                            <span className="item-color__swatch item-color__swatch--none" aria-hidden="true" />
                            No color
                            {items.length === 1 && !current && <span className="item-color__check">✓</span>}
                        </button>
                        {ITEM_COLORS.map((c) => (
                            <button type="button" key={c.key} role="menuitemradio"
                                aria-checked={!!current && current.key === c.key} onClick={() => pick(c.key)}>
                                <span className="item-color__swatch" aria-hidden="true"
                                    style={{ background: c.tint, borderColor: c.ink }} />
                                {c.label}
                                {current && current.key === c.key && <span className="item-color__check">✓</span>}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </span>
    );
}
