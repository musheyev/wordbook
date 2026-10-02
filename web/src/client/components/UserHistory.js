import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { connect } from 'react-redux';
import { fetchUserHistory, deleteHistoryWord } from '../actions';

// Gap between chips; matches .history__chips in styles.css.
const GAP = 8;

// Per-viewer preferences (never throw — private windows etc. can block storage).
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

// Recently searched words, shown as one row of chips with the controls right
// after the last chip. Words that don't fit on the row are hidden behind
// "Show N more"; "Keep open" only appears then, since it only matters when
// something is hidden.
//
// How many chips fit is measured, not fixed: an invisible copy of every chip
// and of the controls is laid out on one line, and we take as many chips as
// fit beside the controls. It's re-measured when the row's width changes
// (window resize, sidebar drag) and when the measured copy changes size
// (e.g. web fonts finishing loading).
function UserHistory({ userHistory, auth, fetchUserHistory, deleteHistoryWord, onSearchWordDefinition }) {
    const [expanded, setExpanded] = useState(false);
    // Sort A–Z by default (the list can be long); the other order is most-recent.
    const [sortAz, setSortAz] = useState(() => readPref('history-sort', 'az') === 'az');
    // When on, picking a word keeps the list expanded instead of collapsing it.
    const [keepOpen, setKeepOpen] = useState(() => readPref('history-keep-open', '0') === '1');
    // How many chips fit on the row; everything fits until measured.
    const [fit, setFit] = useState(Infinity);
    const rowRef = useRef(null);
    const measureRef = useRef(null);

    useEffect(() => {
        if (auth && auth !== '') {
            fetchUserHistory();
        }
    }, [auth, fetchUserHistory]);

    const words = userHistory || [];
    const ordered = sortAz
        ? [...words].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        : words;
    const orderKey = ordered.join('\u0000');

    useLayoutEffect(() => {
        const row = rowRef.current;
        const copy = measureRef.current;
        if (!row || !copy) return undefined;

        const measure = () => {
            const width = row.clientWidth - 1; // slack for sub-pixel rounding
            const chips = Array.from(copy.querySelectorAll('.history-chip'))
                .map((el) => el.getBoundingClientRect().width);
            const controlsAlone = copy.querySelector('[data-controls="all"]').getBoundingClientRect().width;
            const controlsWithMore = copy.querySelector('[data-controls="more"]').getBoundingClientRect().width;

            const all = chips.reduce((sum, w) => sum + w + GAP, 0);
            if (all + controlsAlone <= width) {
                setFit(chips.length);
                return;
            }
            let used = 0;
            let n = 0;
            while (n < chips.length && used + chips[n] + GAP + controlsWithMore <= width) {
                used += chips[n] + GAP;
                n++;
            }
            setFit(Math.max(1, n));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        observer.observe(copy);
        return () => observer.disconnect();
    }, [orderKey]);

    if (ordered.length === 0) {
        return null;
    }

    const hidden = Math.max(0, ordered.length - fit);
    const shown = expanded || hidden === 0 ? ordered : ordered.slice(0, fit);

    const toggleSort = () => setSortAz((v) => { const nv = !v; writePref('history-sort', nv ? 'az' : 'recent'); return nv; });
    const toggleKeepOpen = () => setKeepOpen((v) => { const nv = !v; writePref('history-keep-open', nv ? '1' : '0'); return nv; });

    const onPick = (word) => {
        onSearchWordDefinition(word);
        if (!keepOpen) setExpanded(false);
    };

    const chip = (word, index, live) => (
        <span key={`${word}${index}`} className="history-chip"
            onClick={live ? () => onPick(word) : undefined}>
            {word}
            <i className="history-chip__x" title={live ? `Remove ${word}` : undefined}
                aria-label={live ? `Remove ${word}` : undefined}
                onClick={live ? (e) => { e.stopPropagation(); deleteHistoryWord(word); } : undefined}>×</i>
        </span>
    );

    // moreText: the "Show N more" / "Show less" link, or null when nothing is hidden.
    const controls = (moreText, live, name) => (
        <span className="history__ctrls" data-controls={name}>
            {moreText && (
                <button type="button" className="button-as-link history__more" tabIndex={live ? 0 : -1}
                    onClick={live ? () => setExpanded(!expanded) : undefined}>
                    {moreText}
                </button>
            )}
            <button type="button" className="history__opt" onClick={live ? toggleSort : undefined}
                tabIndex={live ? 0 : -1}
                title={sortAz ? 'Sorted A–Z — tap for most recent' : 'Sorted by most recent — tap for A–Z'}>
                <i className={`${sortAz ? 'sort alphabet down' : 'clock outline'} icon`} aria-hidden="true"></i>
                {sortAz ? 'A–Z' : 'Recent'}
            </button>
            {moreText && (
                <label className="history__opt history__opt--check" title="Keep the list open when you pick a word">
                    <input type="checkbox" checked={keepOpen} tabIndex={live ? 0 : -1}
                        onChange={live ? toggleKeepOpen : () => {}} />
                    Keep open
                </label>
            )}
        </span>
    );

    return (
        <div className="history">
            <div className="history__label">Recently searched</div>

            <div className="history__chips" ref={rowRef}>
                {shown.map((word, index) => chip(word, index, true))}
                {controls(hidden > 0 ? (expanded ? 'Show less' : `Show ${hidden} more`) : null, true)}
            </div>

            {/* Invisible copy used only to measure widths (see above). */}
            <div className="history__measure" ref={measureRef} aria-hidden="true">
                {ordered.map((word, index) => chip(word, index, false))}
                {controls(null, false, 'all')}
                {controls(`Show ${ordered.length} more`, false, 'more')}
            </div>
        </div>
    );
}

function mapStateToProps({ userHistory, auth }, ownProps) {
    return { userHistory, auth, onSearchWordDefinition: ownProps.onSearchWordDefinition };
}

export default connect(mapStateToProps, { fetchUserHistory, deleteHistoryWord })(UserHistory);
