import React from 'react';
import { connect } from 'react-redux';
import NoteWindow from './NoteWindow';

// Renders every open note window. The one with the highest z is "active"
// (highlighted title bar). Rendered once at the app root (see App.js).
function NoteWindows({ windows }) {
    if (!windows.length) return null;
    const topZ = Math.max(...windows.map((w) => w.z));
    return (
        <>
            {windows.map((w, i) => (
                <NoteWindow key={w.id} win={w} spawnIndex={i} isActive={w.z === topZ} />
            ))}
        </>
    );
}

function mapStateToProps({ noteWindows }) {
    return { windows: noteWindows.windows };
}

export default connect(mapStateToProps)(NoteWindows);
