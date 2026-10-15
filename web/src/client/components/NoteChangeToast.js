import React from 'react';

// What a toolbar change to a note did, with Undo (utils/useNoteChange.js).
export default function NoteChangeToast({ note }) {
    if (!note.toast) return null;
    return (
        <div className="undo-toast" role="status">
            {note.toast.text}
            {note.toast.before !== undefined && <button type="button" onClick={note.undo}>Undo</button>}
        </div>
    );
}
