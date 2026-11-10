import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import requireAdmin from '../components/hocs/requireAdmin';
import ConfirmDialog from '../components/ConfirmDialog';
import { ComputerOnly } from '../utils/computerOnly';
import { fetchAdminTeachers, decideTeacher, grantTeacher } from '../actions';
import { TEACHER_REQUESTS_CHANGED } from '../utils/adminPages';

// Admin Teachers page (/admin/teachers; api/teachers.js), on a computer:
//
//   Requests   people asking to become a teacher, with their form answers:
//              Approve, or Decline with an optional reason they'll see.
//   Teachers   everyone who is one: Revoke. "Make someone a teacher" turns
//              any account into a teacher for free, no request needed.
//   Declined / Turned off   for reference.
//
// Until payments exist, an admin's approval is how someone becomes a
// teacher. The Admin link shows how many requests are waiting (Header).
const TABS = [
    { key: 'requested', label: 'Requests' },
    { key: 'active', label: 'Teachers' },
    { key: 'declined', label: 'Declined' },
    { key: 'revoked', label: 'Turned off' },
];

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

function AdminTeachersPage() {
    const dispatch = useDispatch();
    const [tab, setTab] = useState('requested');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(null);
    const [declining, setDeclining] = useState(null); // { userName, reason }
    const [revoking, setRevoking] = useState(null);   // userName
    const [grant, setGrant] = useState({ username: '', displayName: '' });

    const load = (status = tab) => {
        setRows(null);
        setError('');
        dispatch(fetchAdminTeachers(status)).then(setRows, (err) => { setRows([]); setError(err.message); });
    };
    useEffect(() => { load(tab); }, [tab]);

    // Approve, decline or revoke; the row leaves this tab when it's done.
    const decide = async (userName, action, reason) => {
        setBusy(userName);
        setError('');
        setNotice('');
        try {
            await dispatch(decideTeacher(userName, action, reason));
            setRows((list) => (list || []).filter((r) => r.userName !== userName));
            window.dispatchEvent(new Event(TEACHER_REQUESTS_CHANGED));
            setNotice({ approve: `${userName} is now a teacher.`, decline: `Declined ${userName}'s request.`, revoke: `${userName} is no longer a teacher.` }[action]);
        } catch (err) {
            setError(err.message);
        }
        setBusy(null);
    };

    const onGrant = async (e) => {
        e.preventDefault();
        if (!grant.username.trim()) { setError('Type the username of the account.'); return; }
        setBusy('#grant');
        setError('');
        setNotice('');
        try {
            const done = await dispatch(grantTeacher(grant.username.trim(), grant.displayName.trim()));
            setGrant({ username: '', displayName: '' });
            setNotice(`${done.userName} is now a teacher (free).`);
            if (tab === 'active') load('active');
        } catch (err) {
            setError(err.message);
        }
        setBusy(null);
    };

    const details = (r) => (
        <span className="teachers-admin__details">
            <span className="teachers-admin__name">{r.displayName || r.userName}</span>
            <span className="teachers-admin__user">{r.userName}{r.free ? ' · free' : ''}</span>
            {(r.subject || r.level) && (
                <span className="teachers-admin__line">{[r.subject, r.level].filter(Boolean).join(' · ')}</span>
            )}
            <span className="teachers-admin__line teachers-admin__muted">
                {[r.students && `${r.students} students`, r.country,
                    tab === 'requested' ? `asked ${day(r.requestedAt)}` : r.decidedAt && `${TABS.find((t) => t.key === tab).label.toLowerCase()} ${day(r.decidedAt)}`]
                    .filter(Boolean).join(' · ')}
            </span>
            {r.declineReason && <span className="teachers-admin__line teachers-admin__muted">Reason: {r.declineReason}</span>}
        </span>
    );

    return (
        <ComputerOnly>
            <div className="admin-page teachers-admin">
                <div className="admin-page__head">
                    <h1 className="cb-page-title">Teachers</h1>
                </div>

                <div className="teachers-admin__tabs" role="tablist">
                    {TABS.map((t) => (
                        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                            className={`teachers-admin__tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
                            {t.label}{t.key === 'requested' && tab === 'requested' && rows && rows.length ? ` (${rows.length})` : ''}
                        </button>
                    ))}
                </div>

                {notice && <p className="teachers-admin__notice">{notice}</p>}
                {error && <p className="cb-sheet__error">{error}</p>}

                {tab === 'active' && (
                    <form className="teachers-admin__grant" onSubmit={onGrant}>
                        <span className="teachers-admin__grant-title">Make someone a teacher (free)</span>
                        <input type="text" placeholder="Username" aria-label="Username" value={grant.username}
                            onChange={(e) => setGrant({ ...grant, username: e.target.value })} />
                        <input type="text" placeholder="Name students see (optional)" aria-label="Name students see"
                            value={grant.displayName} onChange={(e) => setGrant({ ...grant, displayName: e.target.value })} />
                        <button type="submit" className="cb-btn cb-btn--accent" disabled={busy === '#grant'}>
                            {busy === '#grant' ? 'Saving…' : 'Make teacher'}
                        </button>
                    </form>
                )}

                {rows === null ? (
                    <p className="teachers-admin__muted">Loading…</p>
                ) : rows.length === 0 ? (
                    <div className="cb-empty">
                        {{ requested: 'No requests waiting.', active: 'No teachers yet.', declined: 'Nothing declined.', revoked: 'No one turned off.' }[tab]}
                    </div>
                ) : (
                    <ul className="teachers-admin__list">
                        {rows.map((r) => (
                            <li key={r.userName} className="teachers-admin__row">
                                {details(r)}
                                <span className="teachers-admin__actions">
                                    {tab === 'requested' && declining && declining.userName === r.userName ? (
                                        <span className="teachers-admin__decline">
                                            <input type="text" placeholder="Reason they'll see (optional)" aria-label="Reason"
                                                value={declining.reason} autoFocus
                                                onChange={(e) => setDeclining({ ...declining, reason: e.target.value })} />
                                            <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setDeclining(null)}>Cancel</button>
                                            <button type="button" className="cb-btn cb-btn--danger" disabled={busy === r.userName}
                                                onClick={() => { decide(r.userName, 'decline', declining.reason); setDeclining(null); }}>
                                                Decline
                                            </button>
                                        </span>
                                    ) : tab === 'requested' ? (
                                        <>
                                            <button type="button" className="cb-btn cb-btn--ghost" disabled={busy === r.userName}
                                                onClick={() => setDeclining({ userName: r.userName, reason: '' })}>Decline</button>
                                            <button type="button" className="cb-btn cb-btn--accent" disabled={busy === r.userName}
                                                onClick={() => decide(r.userName, 'approve')}>
                                                {busy === r.userName ? 'Saving…' : 'Approve'}
                                            </button>
                                        </>
                                    ) : tab === 'active' ? (
                                        <button type="button" className="cb-btn cb-btn--ghost" disabled={busy === r.userName}
                                            onClick={() => setRevoking(r.userName)}>Revoke</button>
                                    ) : null}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <ConfirmDialog
                    open={!!revoking}
                    title={`Revoke ${revoking || ''}?`}
                    message="They stop being a teacher. Later, this also closes their classrooms. You can make them a teacher again with Make teacher."
                    confirmLabel="Revoke"
                    cancelLabel="Cancel"
                    tone="danger"
                    onConfirm={() => { const u = revoking; setRevoking(null); decide(u, 'revoke'); }}
                    onCancel={() => setRevoking(null)}
                />
            </div>
        </ComputerOnly>
    );
}

export default requireAdmin(AdminTeachersPage);
