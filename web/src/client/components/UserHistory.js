import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { connect } from 'react-redux';
import { fetchUserHistory, deleteHistoryWord } from '../actions';

// Gap between chips, and the controls' left margin; match .history__chips
// and .history__ctrls in styles.css.
const GAP = 8;
const CONTROLS_MARGIN = 4;
// Same breakpoint as the phone layout in styles.css.
const PHONE = '(max-width: 768px)';

// Per-viewer preferences (never throw — private windows etc. can block storage).
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches;

// Recently searched words, shown as one row of chips. Words that don't fit on
// the row are hidden behind "Show N more". "Keep open" only appears while the
// full list is open, the only time it matters.
//
// Where the controls go:
//   desktop  right after the last chip, in the same row
//   phone    on the "Recently searched" line, so the whole row is for words
//
// How many chips fit is measured, not fixed: an invisible copy of every chip
// and of the controls is laid out on one line, and we take as many chips as
// fit (beside the controls, on desktop). It's re-measured when the row's
// width changes (window resize, sidebar drag) and when the measured copy
// changes size (e.g. web fonts finishing loading).
function UserHistory({ userHistory, auth, fetchUserHistory, deleteHistoryWord, onSearchWordDefinition }) {
    const [expanded, setExpanded] = useState(false);
    // Sort A–Z by default (the list can be long); the other order is most-recent.
    const [sortAz, setSortAz] = useState(() => readPref('history-sort', 'az') === 'az');
    // When on, picking a word keeps the list expanded instead of collapsing it.
    const [keepOpen, setKeepOpen] = useState(() => readPref('history-keep-open', '0') === '1');
    const [phone, setPhone] = useState(isPhone);
    // How many chips fit on the row; everything fits until measured.
    const [fit, setFit] = useState(Infinity);
    const rowRef = useRef(null);
    const measureRef = useRef(null);

    useEffect(() => {
        if (auth && auth !== '') {
            fetchUserHistory();
        }
    }, [auth, fetchUserHistory]);

    useEffect(() => {
        const query = window.matchMedia(PHONE);
        const onChange = () => setPhone(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);

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
            // Room the controls take after the last chip: none on a phone
            // (they're on the label line); else gap + margin + their width.
            const controlsWidth = (name) => (phone ? 0
                : GAP + CONTROLS_MARGIN + copy.querySelector(`[data-controls="${name}"]`).getBoundingClientRect().width);
            // Width of the first n chips with the gaps between them.
            const chipsWidth = (n) => chips.slice(0, n).reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, n - 1);

            if (chipsWidth(chips.length) + controlsWidth('all') <= width) {
                setFit(chips.length);
                return;
            }
            const controls = controlsWidth('more');
            let n = 0;
            while (n < chips.length && chipsWidth(n + 1) + controls <= width) n++;
            setFit(Math.max(1, n));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        observer.observe(copy);
        return () => observer.disconnect();
    }, [orderKey, phone]);

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

    // moreText: "Show N more" / "Show less", or null when nothing is hidden.
    // withKeepOpen: only while the full list is open.
    const controls = (moreText, withKeepOpen, live, name) => (
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
            {withKeepOpen && (
                <label className="history__opt history__opt--check" title="Keep the list open when you pick a word">
                    <input type="checkbox" checked={keepOpen} tabIndex={live ? 0 : -1}
                        onChange={live ? toggleKeepOpen : () => {}} />
                    Keep open
                </label>
            )}
        </span>
    );

    const open = expanded && hidden > 0;
    const liveControls = controls(hidden > 0 ? (expanded ? 'Show less' : `Show ${hidden} more`) : null, open, true);

    return (
        <div className="history">
            <div className="history__head">
                <div className="history__label">Recently searched</div>
                {phone && liveControls}
            </div>

            <div className="history__chips" ref={rowRef}>
                {shown.map((word, index) => chip(word, index, true))}
                {!phone && liveControls}
            </div>

            {/* Invisible copy used only to measure widths (see above). */}
            <div className="history__measure" ref={measureRef} aria-hidden="true">
                {ordered.map((word, index) => chip(word, index, false))}
                {controls(null, false, false, 'all')}
                {controls(`Show ${ordered.length} more`, false, false, 'more')}
            </div>
        </div>
    );
}

function mapStateToProps({ userHistory, auth }, ownProps) {
    return { userHistory, auth, onSearchWordDefinition: ownProps.onSearchWordDefinition };
}

export default connect(mapStateToProps, { fetchUserHistory, deleteHistoryWord })(UserHistory);
