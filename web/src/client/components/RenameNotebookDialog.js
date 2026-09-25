import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { renameWordbook } from '../actions';

// Rename a notebook in a dialog (a bottom sheet on phones). Stays open and
// shows the server's message if the rename fails, e.g. the name is taken.
function RenameNotebookDialog({ open, name, onClose, onRenamed, renameWordbook }) {
    const [draft, setDraft] = useState(name);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setDraft(name);
            setError('');
            setSaving(false);
        }
    }, [open, name]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const onSubmit = async (e) => {
        e.preventDefault();
        const next = draft.trim();
        if (next === '') {
            setError('Enter a name.');
            return;
        }
        if (next.includes('#')) {
            setError("Names can't contain #.");
            return;
        }
        if (next === name) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            await renameWordbook(name, next);
            onRenamed(next);
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <div className="cb-sheet__overlay" onMouseDown={onClose}>
            <form className="cb-sheet" role="dialog" aria-modal="true" aria-label="Rename notebook"
                onMouseDown={(e) => e.stopPropagation()} onSubmit={onSubmit}>
                <div className="cb-sheet__grab" aria-hidden="true" />
                <h3 className="cb-sheet__title">Rename notebook</h3>
                <input className="cb-sheet__input" type="text" value={draft} autoFocus
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => { setDraft(e.target.value); setError(''); }} />
                {error && <div className="cb-sheet__error">{error}</div>}
                <div className="cb-sheet__actions">
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="cb-btn cb-btn--accent" disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default connect(null, { renameWordbook })(RenameNotebookDialog);
