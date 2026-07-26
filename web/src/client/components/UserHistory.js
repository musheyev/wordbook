import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { fetchUserHistory, deleteHistoryWord } from '../actions';

const CAP = 8;

const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    border: '1px solid #d9dbe0',
    borderRadius: '999px',
    background: '#fff',
    fontSize: '0.85rem',
    color: '#2f6fb3',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
};

const xStyle = {
    fontStyle: 'normal',
    fontSize: '1rem',
    lineHeight: 1,
    color: '#9a9a9a',
    cursor: 'pointer',
};

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
        <div className="history" style={{ marginBottom: '10px' }}>
            <div style={{ marginBottom: '8px' }}>
                <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Recently searched words</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {shown.map((word, index) => (
                    <span key={`${word}${index}`} style={chipStyle}
                        onClick={() => onSearchWordDefinition(word)}>
                        {word}
                        <i style={xStyle} title={`Remove ${word}`}
                            onClick={(e) => { e.stopPropagation(); deleteHistoryWord(word); }}>×</i>
                    </span>
                ))}
            </div>

            {extra > 0 && (
                <button className="button-as-link" style={{ marginTop: '10px', fontSize: '0.85rem' }}
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
