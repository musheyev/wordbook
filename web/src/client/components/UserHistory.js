import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { fetchUserHistory, deleteHistoryWord } from '../actions';

const CAP = 8;

function UserHistory({ userHistory, auth, fetchUserHistory, deleteHistoryWord, onSearchWordDefinition }) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (auth && auth !== '') {
            fetchUserHistory();
        }
    }, [auth, fetchUserHistory]);

    if (!userHistory || userHistory.length === 0) {
        return null;
    }

    const shown = expanded ? userHistory : userHistory.slice(0, CAP);
    const extra = userHistory.length - CAP;

    return (
        <div className="history">
            <div className="history__label">Recently searched</div>

            <div className="history__chips">
                {shown.map((word, index) => (
                    <span key={`${word}${index}`} className="history-chip"
                        onClick={() => { onSearchWordDefinition(word); setExpanded(false); }}>
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
