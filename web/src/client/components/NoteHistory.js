import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchNoteVersions, fetchNoteVersion, restoreNoteVersion, requestErrorMessage } from '../actions';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { reportNoteAudio } from '../utils/ttsPlayer';
import { noteText, textChanges } from '../utils/noteDiff';
import Spinner from './Spinner';

// The History window of a note (opened from its toolbar, NoteHistoryButton):
// its earlier versions from the last 30 days (api/card-versions.js), newest
// first. Picking one shows it:
//   Changes since then  its text, with what was added since then in green
//                       and what isn't in the note any more crossed out in
//                       red (utils/noteDiff.js)
//   As it was           the version itself, formatted
// Restore this version makes it the note again; the note as it is now is
// kept as a version first, so the message after it offers Undo, and
// "Before restore" in this list brings it back later too. Copy text copies
// the version, to take back just a part of it.
//
// Wide screens show the list and the version side by side; phones show the
// list, then the version full screen with a way back to the list.

/** "Today 10:15 AM", "Yesterday 3:02 PM", "Nov 18, 1:40 PM". */
export function whenLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return `Today ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
    const date = d.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    });
    return `${date}, ${time}`;
}

const REASONS = { restore: 'Before restore', deleted: 'Before deleting' };

/** "40 more than now", "12 fewer than now", "same length as now". */
const lengthVsNow = (words, nowWords) => {
    const d = words - nowWords;
    if (d === 0) return 'same length as now';
    return `${Math.abs(d).toLocaleString()} ${d > 0 ? 'more' : 'fewer'} than now`;
};

/**
 * @param {object} props
 * @param {{card_id: string, title: string, content: string}} props.card the note as it is now
 * @param {() => void} props.onClose
 * @param {(info: {before: string|null, when: string}) => void} props.onRestored
 */
export default function NoteHistory({ card, onClose, onRestored }) {
    const dispatch = useDispatch();
    const [versions, setVersions] = useState(null); // null while loading
    const [nowWords, setNowWords] = useState(0); // the note's length now (server's count)
    const [listError, setListError] = useState('');
    const [selected, setSelected] = useState(null); // a version's key
    const [loaded, setLoaded] = useState({}); // key -> { title, content } | { error }
    const [view, setView] = useState('changes');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [copied, setCopied] = useState(false);
    const asWasRef = useRef(null);

    useEffect(() => {
        let gone = false;
        dispatch(fetchNoteVersions(card.card_id))
            .then(({ versions: list, nowWords: count }) => {
                if (gone) return;
                setVersions(list);
                setNowWords(count);
                // Wide screens open on the newest version; phones on the list.
                if (list.length && window.matchMedia('(min-width: 769px) and (min-height: 501px)').matches) {
                    setSelected(list[0].key);
                }
            })
            .catch((err) => { if (!gone) setListError(requestErrorMessage(err, "Couldn't load this note's history.")); });
        return () => { gone = true; };
    }, [card.card_id, dispatch]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // The picked version's text, fetched the first time it's picked.
    useEffect(() => {
        if (!selected || loaded[selected]) return;
        dispatch(fetchNoteVersion(card.card_id, selected))
            .then((v) => setLoaded((had) => ({ ...had, [selected]: v })))
            .catch((err) => setLoaded((had) => ({
                ...had, [selected]: { error: requestErrorMessage(err, "Couldn't load this version.") },
            })));
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setActionError(''); setCopied(false); }, [selected]);

    const nowText = useMemo(() => noteText(card.content), [card.content]);
    const version = selected ? loaded[selected] : null;
    const ready = version && !version.error;
    const changes = useMemo(
        () => (ready ? textChanges(noteText(version.content), nowText) : null),
        [ready, version, nowText],
    );
    useEffect(() => { if (ready && view === 'asWas') renderMathIn(asWasRef.current); }, [ready, view, selected]);

    const item = versions && selected ? versions.find((v) => v.key === selected) : null;

    const restore = async () => {
        setBusy(true);
        setActionError('');
        try {
            const { card: restored, before } = await dispatch(restoreNoteVersion(card.card_id, selected));
            reportNoteAudio(`card:${card.card_id}`, restored.content);
            onRestored({ before, when: whenLabel(item.saved_at) });
            onClose();
        } catch (err) {
            setActionError(requestErrorMessage(err, "Couldn't restore this version."));
            setBusy(false);
        }
    };

    const copy = async () => {
        const html = sanitizeCardHtml(version.content);
        const text = noteText(version.content);
        try {
            if (window.ClipboardItem && navigator.clipboard.write) {
                await navigator.clipboard.write([new window.ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                })]);
            } else {
                await navigator.clipboard.writeText(text);
            }
            setCopied(true);
        } catch (err) {
            setActionError("Couldn't copy. Try again.");
        }
    };

    const unchanged = changes && changes.every((p) => !p.added && !p.removed);

    return (
        <div className="cb-sheet__overlay nh-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`nh${selected ? ' nh--picked' : ''}`} role="dialog" aria-label={`History of ${card.title}`}>
                <div className="nh__head">
                    <div className="nh__heading">
                        <h2 className="nh__title">History</h2>
                        <span className="nh__note">{card.title}</span>
                    </div>
                    <button type="button" className="card-tool" aria-label="Close" title="Close" onClick={onClose}>
                        <i className="times icon"></i>
                    </button>
                </div>

                <div className="nh__body">
                    <div className="nh__list" role="listbox" aria-label="Earlier versions">
                        {listError ? (
                            <div className="nh__empty">{listError}</div>
                        ) : versions === null ? (
                            <Spinner label="Loading…" />
                        ) : versions.length === 0 ? (
                            <div className="nh__empty">
                                No earlier versions yet. Each time you save this note, the version it replaces
                                is kept here for 30 days.
                            </div>
                        ) : versions.map((v) => (
                            <button type="button" key={v.key} role="option" aria-selected={v.key === selected}
                                className={`nh__row${v.key === selected ? ' is-on' : ''}`}
                                onClick={() => setSelected(v.key)}>
                                <span className="nh__when">{whenLabel(v.saved_at)}</span>
                                <span className="nh__sub">
                                    {REASONS[v.reason] && <span className="nh__reason">{REASONS[v.reason]}</span>}
                                    {v.words.toLocaleString()} words · {lengthVsNow(v.words, nowWords)}
                                </span>
                                {v.title !== card.title && <span className="nh__sub">Titled “{v.title}”</span>}
                            </button>
                        ))}
                        {versions && versions.length > 0 && (
                            <div className="nh__foot">Versions are kept for 30 days.</div>
                        )}
                    </div>

                    <div className="nh__preview">
                        {!selected ? (
                            versions && versions.length > 0 && <div className="nh__empty nh__pick">Pick a version to see it.</div>
                        ) : (
                            <>
                                <div className="nh__bar">
                                    <button type="button" className="nh__back" onClick={() => setSelected(null)}>
                                        <i className="chevron left icon" aria-hidden="true"></i>All versions
                                    </button>
                                    <div className="nh__seg" role="group" aria-label="Show">
                                        <button type="button" className={view === 'changes' ? 'is-on' : ''}
                                            aria-pressed={view === 'changes'} onClick={() => setView('changes')}>
                                            Changes since then
                                        </button>
                                        <button type="button" className={view === 'asWas' ? 'is-on' : ''}
                                            aria-pressed={view === 'asWas'} onClick={() => setView('asWas')}>
                                            As it was
                                        </button>
                                    </div>
                                    <span className="nh__spacer" />
                                    <button type="button" className="cb-btn" onClick={copy} disabled={!ready}>
                                        <i className={`${copied ? 'check' : 'copy outline'} icon`}></i>{copied ? 'Copied' : 'Copy text'}
                                    </button>
                                    <button type="button" className="cb-btn cb-btn--accent" onClick={restore} disabled={!ready || busy}>
                                        <i className={busy ? 'spinner loading icon' : 'undo icon'}></i>Restore this version
                                    </button>
                                </div>
                                {actionError && <div className="nh__error" role="alert">{actionError}</div>}
                                {!version ? (
                                    <Spinner label="Loading…" />
                                ) : version.error ? (
                                    <div className="nh__empty">{version.error}</div>
                                ) : view === 'asWas' ? (
                                    <div className="card-content nh__text" ref={asWasRef}
                                        dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(version.content) }} />
                                ) : (
                                    <>
                                        <div className="nh__legend">
                                            {unchanged ? 'The text is the same as now.' : (
                                                <>
                                                    <ins className="nh-add">Added since then</ins>
                                                    <del className="nh-del">Not in the note now</del>
                                                </>
                                            )}
                                        </div>
                                        <div className="nh__text nh__changes">
                                            {changes.map((part, i) => (part.added
                                                ? <ins key={i} className="nh-add">{part.value}</ins>
                                                : part.removed
                                                    ? <del key={i} className="nh-del">{part.value}</del>
                                                    : <span key={i}>{part.value}</span>))}
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
