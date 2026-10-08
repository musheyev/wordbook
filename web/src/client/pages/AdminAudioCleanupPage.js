import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAdmin from '../components/hocs/requireAdmin';
import ConfirmDialog from '../components/ConfirmDialog';
import {
    getAudioArchive, sweepAudioArchive, restoreAudioArchive, clearAudioArchive,
} from '../actions';

// Admin › Audio cleanup (/admin/audio-cleanup). Read-aloud audio that an item
// stopped using (its text was edited, or a language or voice changed) and
// that nothing uses now is moved to an archive (reversible), can be restored,
// and can be permanently cleared. See api/tts-gc.js and api/tts-refs.js.
const kb = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);
const n = (x) => (x === 1 ? '' : 's');

function AdminAudioCleanupPage({ getAudioArchive, sweepAudioArchive, restoreAudioArchive, clearAudioArchive }) {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);

    const refresh = async () => {
        try {
            setStatus(await getAudioArchive());
        } catch (err) {
            setError(err.message);
        }
    };
    useEffect(() => { refresh(); }, []);

    // Run an action, show its result line, then refresh the counts.
    const run = async (fn, done) => {
        setBusy(true); setError(''); setMsg('');
        try {
            setMsg(done(await fn()));
            await refresh();
        } catch (err) {
            setError(err.message || 'Something went wrong.');
        }
        setBusy(false);
    };

    const configured = !status || status.configured !== false;
    const unused = status ? status.unused : null;
    const archived = status ? status.archived : null;

    return (
        <div className="admin-page">
            <div className="admin-page__head">
                <Link className="cb-mbar__back" to="/admin" aria-label="Admin" title="Admin">
                    <i className="chevron left icon" aria-hidden="true"></i>
                </Link>
                <h1 className="cb-page-title">Audio cleanup</h1>
            </div>

            <p className="admin-cleanup__intro">
                Read-aloud audio is saved so each sentence is generated only once. When a note's text,
                a language mark or a voice changes, the old audio is no longer used. Archiving moves
                unused audio aside instead of deleting it, so it can be restored. Audio is only a cache:
                anything archived by mistake is simply generated again when that text is read aloud.
                Audio from before tracking started is left alone until its note is read aloud again.
            </p>

            {!configured && (
                <div className="admin-error" style={{ margin: '12px 0' }}>
                    Audio storage isn't configured on the server, so cleanup is unavailable.
                </div>
            )}

            <div className="admin-cleanup__rows">
                <div className="admin-cleanup__row">
                    <span>
                        Unused: <strong>{unused == null ? '…' : unused}</strong> file{n(unused)}
                        {status && status.unused > 0 && <> ({kb(status.unusedBytes)})</>}
                        {status && <span className="admin-cleanup__note"> · {status.tracked} in use by notes and words</span>}
                    </span>
                    <button className="cb-btn cb-btn--accent" disabled={busy || !configured || !unused}
                        onClick={() => run(sweepAudioArchive, (r) => `Archived ${r.archived} audio file${n(r.archived)}.`)}>
                        Archive unused audio
                    </button>
                </div>

                <div className="admin-cleanup__row">
                    <span>Archive: <strong>{archived == null ? '…' : archived}</strong> file{n(archived)}</span>
                    <button className="cb-btn" disabled={busy || !archived}
                        onClick={() => run(restoreAudioArchive, (r) => `Restored ${r.restored} audio file${n(r.restored)}.`)}>
                        Restore all
                    </button>
                    <button className="cb-btn cb-btn--danger" disabled={busy || !archived}
                        onClick={() => setConfirmClear(true)}>
                        Clear archive
                    </button>
                </div>
            </div>

            {msg && <div style={{ marginTop: '16px', color: 'var(--cb-ink)' }}>{msg}</div>}
            {error && <div className="admin-error" style={{ marginTop: '16px', color: '#c0392b' }}>{error}</div>}

            <ConfirmDialog
                open={confirmClear}
                title="Clear the audio archive?"
                message={`Permanently delete ${archived || 0} archived audio file${n(archived)}? This can't be undone.`}
                confirmLabel="Delete all"
                cancelLabel="Cancel"
                tone="danger"
                onConfirm={() => {
                    setConfirmClear(false);
                    run(clearAudioArchive, (r) => `Deleted ${r.deleted} archived audio file${n(r.deleted)}.`);
                }}
                onCancel={() => setConfirmClear(false)}
            />
        </div>
    );
}

export default connect(null, {
    getAudioArchive, sweepAudioArchive, restoreAudioArchive, clearAudioArchive,
})(requireAdmin(AdminAudioCleanupPage));
