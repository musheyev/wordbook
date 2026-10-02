import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import requireAdmin from '../components/hocs/requireAdmin';
import ConfirmDialog from '../components/ConfirmDialog';
import {
    getImageArchive, sweepImageArchive, restoreImageArchive, clearImageArchive,
} from '../actions';

// Admin › Image cleanup (/admin/image-cleanup). Orphaned note images are moved
// to an archive (reversible), can be restored, and can be permanently cleared.
function AdminImageCleanupPage({
    getImageArchive, sweepImageArchive, restoreImageArchive, clearImageArchive,
}) {
    const [count, setCount] = useState(null);
    const [configured, setConfigured] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);

    const refresh = async () => {
        try {
            const r = await getImageArchive();
            setCount(r.count);
            setConfigured(r.configured !== false);
        } catch (err) {
            setError(err.message);
        }
    };
    useEffect(() => { refresh(); }, []);

    // Run an action, show its result line, then refresh the archive count.
    const run = async (fn, done) => {
        setBusy(true); setError(''); setMsg('');
        try {
            const r = await fn();
            setMsg(done(r));
            await refresh();
        } catch (err) {
            setError(err.message || 'Something went wrong.');
        }
        setBusy(false);
    };

    const n = (x) => (x === 1 ? '' : 's');

    return (
        <div className="admin-page">
            <div className="admin-page__head">
                <h1 className="cb-page-title">Image cleanup</h1>
            </div>

            <p style={{ color: 'var(--cb-ink-2)', maxWidth: '640px', lineHeight: 1.5 }}>
                Orphaned note images — ones referenced by no note, word note, or shared copy — are
                moved to an archive instead of deleted, so a sweep can be rolled back. Images are
                never touched until 24 hours after upload.
            </p>

            {!configured && (
                <div className="admin-error" style={{ margin: '12px 0' }}>
                    Image storage isn't configured on the server, so cleanup is unavailable.
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '16px', maxWidth: '640px' }}>
                <div>
                    <button className="cb-btn cb-btn--accent" disabled={busy || !configured}
                        onClick={() => run(sweepImageArchive,
                            (r) => `Archived ${r.archived} image${n(r.archived)} (${r.inUse} in use, ${r.scanned} total).`)}>
                        Archive orphaned images
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
                    paddingTop: '14px', borderTop: '1px solid var(--cb-border)' }}>
                    <span>Archive: <strong>{count == null ? '…' : count}</strong> image{n(count)}</span>
                    <button className="cb-btn" disabled={busy || !count}
                        onClick={() => run(restoreImageArchive, (r) => `Restored ${r.restored} image${n(r.restored)}.`)}>
                        Restore all
                    </button>
                    <button className="cb-btn cb-btn--danger" disabled={busy || !count}
                        onClick={() => setConfirmClear(true)}>
                        Clear archive
                    </button>
                </div>
            </div>

            {msg && <div style={{ marginTop: '16px', color: 'var(--cb-ink)' }}>{msg}</div>}
            {error && <div className="admin-error" style={{ marginTop: '16px', color: '#c0392b' }}>{error}</div>}

            <ConfirmDialog
                open={confirmClear}
                title="Clear the archive?"
                message={`Permanently delete ${count || 0} archived image${n(count)}? This can't be undone.`}
                confirmLabel="Delete all"
                cancelLabel="Cancel"
                tone="danger"
                onConfirm={() => {
                    setConfirmClear(false);
                    run(clearImageArchive, (r) => `Deleted ${r.deleted} archived image${n(r.deleted)}.`);
                }}
                onCancel={() => setConfirmClear(false)}
            />
        </div>
    );
}

export default connect(null, {
    getImageArchive, sweepImageArchive, restoreImageArchive, clearImageArchive,
})(requireAdmin(AdminImageCleanupPage));
