import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { fetchUserHistory, deleteHistoryWord } from '../actions';

const CAP = 8;

// Per-viewer preferences (never throw — private windows etc. can block storage).
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

function UserHistory({ userHistory, auth, fetchUserHistory, deleteHistoryWord, onSearchWordDefinition }) {
    const [expanded, setExpanded] = useState(false);
    // Sort A–Z by default (the list can be long); the other order is most-recent.
    const [sortAz, setSortAz] = useState(() => readPref('history-sort', 'az') === 'az');
    // When on, picking a word keeps the list expanded instead of collapsing it.
    const [keepOpen, setKeepOpen] = useState(() => readPref('history-keep-open', '0') === '1');

    useEffect(() => {
        if (auth && auth !== '') {
            fetchUserHistory();
        }
    }, [auth, fetchUserHistory]);

    if (!userHistory || userHistory.length === 0) {
        return null;
    }

    const ordered = sortAz
        ? [...userHistory].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        : userHistory;
    const shown = expanded ? ordered : ordered.slice(0, CAP);
    const extra = ordered.length - CAP;

    const toggleSort = () => setSortAz((v) => { const nv = !v; writePref('history-sort', nv ? 'az' : 'recent'); return nv; });
    const toggleKeepOpen = () => setKeepOpen((v) => { const nv = !v; writePref('history-keep-open', nv ? '1' : '0'); return nv; });

    const onPick = (word) => {
        onSearchWordDefinition(word);
        if (!keepOpen) setExpanded(false);
    };

    return (
        <div className="history">
            <div className="history__head">
                <div className="history__label">Recently searched</div>
                <div className="history__opts">
                    <button type="button" className="history__opt" onClick={toggleSort}
                        title={sortAz ? 'Sorted A–Z — tap for most recent' : 'Sorted by most recent — tap for A–Z'}>
                        <i className={`${sortAz ? 'sort alphabet down' : 'clock outline'} icon`} aria-hidden="true"></i>
                        {sortAz ? 'A–Z' : 'Recent'}
                    </button>
                    <label className="history__opt history__opt--check" title="Keep the list open when you pick a word">
                        <input type="checkbox" checked={keepOpen} onChange={toggleKeepOpen} />
                        Keep open
                    </label>
                </div>
            </div>

            <div className="history__chips">
                {shown.map((word, index) => (
                    <span key={`${word}${index}`} className="history-chip"
                        onClick={() => onPick(word)}>
                        {word}
                        <i className="history-chip__x" title={`Remove ${word}`} aria-label={`Remove ${word}`}
                            onClick={(e) => { e.stopPropagation(); deleteHistoryWord(word); }}>×</i>
                    </span>
                ))}
            </div>

            {extra > 0 && (
                <button className="button-as-link history__more"
                    onClick={() => setExpanded(!expanded)}>
                    {expanded ? 'Show less' : `Show ${extra} more`}
                </button>
            )}
        </div>
    );
}

function mapStateToProps({ userHistory, auth }, ownProps) {
    return { userHistory, auth, onSearchWordDefinition: ownProps.onSearchWordDefinition };
}

export default connect(mapStateToProps, { fetchUserHistory, deleteHistoryWord })(UserHistory);
