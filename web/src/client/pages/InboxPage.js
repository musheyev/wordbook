import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import {
    fetchInbox, fetchInboxItem, moveInboxItem, removeInboxItem, fetchWordbooks, lookupWord,
} from '../actions';
import Definition from '../components/Definition';
import { sanitizeCardHtml } from '../utils/sanitize';
import { renderMathIn } from '../utils/math';
import { itemPath } from '../utils/notebookPaths';
import { timeAgo } from '../utils/timeAgo';

// The Inbox: words and notes other users shared with you.
//
//   /inbox        the list, newest first, each row showing who sent it
//   /inbox/<id>   one item, with "Move to notebook" and "Remove"
//
// Items here aren't in any notebook yet. Moving one creates your own copy in
// the notebook you pick (a new note, for shared notes) and takes it out of the
// Inbox; see api/inbox.js.

const inboxItemPath = (id) => `/inbox/${encodeURIComponent(id)}`;

function InboxPage(props) {
    const { id } = useParams();
    return id ? <InboxItem {...props} id={id} /> : <InboxList {...props} />;
}

// ---- List -------------------------------------------------------------------

function InboxList({ inbox, fetchInbox }) {
    useEffect(() => { fetchInbox(); }, [fetchInbox]);

    return (
        <div className="cb-detail">
            <div className="inbox-head">
                <Link className="cb-mbar__back" to="/account" aria-label="My notebooks" title="My notebooks">
                    <i className="chevron left icon" aria-hidden="true"></i>
                </Link>
                <h1 className="inbox-head__title">Inbox</h1>
            </div>

            {inbox === null ? null : inbox.length === 0 ? (
                <div className="cb-detail__empty">
                    Nothing here yet. When someone shares a word or note with you, it shows up here.
                </div>
            ) : (
                <div className="nb-list">
                    <div className="nb-list__count">
                        {inbox.length} {inbox.length === 1 ? 'item' : 'items'} shared with you
                    </div>
                    <ul className="nb-list__rows">
                        {inbox.map((item) => {
                            const isCard = item.type === 'card';
                            return (
                                <li key={item.id}>
                                    <Link className="nb-row" to={inboxItemPath(item.id)}>
                                        <span className={`nb-row__icon nb-row__icon--${item.type}`} aria-hidden="true">
                                            <i className={`${isCard ? 'sticky note outline' : 'font'} icon`}></i>
                                        </span>
                                        <span className="nb-row__text">
                                            <span className="nb-row__title">{item.title}</span>
                                            <span className="nb-row__sub">
                                                from <strong>{item.from}</strong> · {timeAgo(item.sharedAt)}
                                                {isCard && item.preview ? ` · ${item.preview}` : ''}
                                            </span>
                                        </span>
                                        <i className="chevron right icon nb-row__chev" aria-hidden="true"></i>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ---- One item ---------------------------------------------------------------

function InboxItem({ id, wordbooks, fetchInboxItem, moveInboxItem, removeInboxItem, fetchWordbooks, lookupWord }) {
    const navigate = useNavigate();
    const [item, setItem] = useState(null);           // the inbox item, once loaded
    const [definitions, setDefinitions] = useState(null); // for a shared word
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const contentRef = useRef(null);

    // Load the item (and, for a word, its definitions) whenever the id changes.
    // `cancelled` guards against a slow response for a previous id arriving
    // after the user has already moved on to another item.
    useEffect(() => {
        let cancelled = false;
        setItem(null);
        setDefinitions(null);
        setError('');
        fetchInboxItem(id)
            .then((data) => {
                if (cancelled) return;
                setItem(data);
                if (data.type === 'word') {
                    lookupWord(data.title)
                        .then((result) => { if (!cancelled) setDefinitions(result && result.definitions); })
                        .catch(() => {});
                }
            })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => { fetchWordbooks(); }, [fetchWordbooks]);

    // KaTeX math in a shared note is rendered after its HTML is on the page.
    useEffect(() => { renderMathIn(contentRef.current); });

    const onMove = async (wordbook) => {
        setMenuOpen(false);
        setBusy(true);
        try {
            const moved = await moveInboxItem(id, wordbook);
            // Open the item in its new notebook.
            navigate(itemPath(wordbook, moved), { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    const onRemove = async () => {
        setBusy(true);
        try {
            await removeInboxItem(id);
            navigate('/inbox', { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    const notebooks = Array.isArray(wordbooks) ? wordbooks : [];

    return (
        <div className="cb-detail cb-detail--item">
            <div className="nb-back nb-back--always">
                <Link className="nb-back__link" to="/inbox">
                    <i className="chevron left icon" aria-hidden="true"></i>
                    <span className="nb-back__name">Inbox</span>
                </Link>
            </div>

            <section id="worddefinition">
                {error && <div className="cb-sheet__error inbox-item__error">{error}</div>}

                {item && (
                    <div className={`search-result${item.type === 'card' ? ' search-result--card' : ''}`}>
                        <div className="current-word-container">
                            <div className="card-heading"><h2>{item.title}</h2></div>
                            <div className="inbox-item__from">
                                Shared by <strong>{item.from}</strong> · {timeAgo(item.sharedAt)}
                            </div>
                            <div className="card-header-actions">
                                <span className="cb-menu">
                                    <button type="button" className="cb-btn cb-btn--accent inbox-item__move"
                                        disabled={busy} aria-haspopup="menu" aria-expanded={menuOpen}
                                        onClick={() => setMenuOpen((v) => !v)}>
                                        Move to notebook
                                        <i className={`chevron ${menuOpen ? 'up' : 'down'} icon`} aria-hidden="true"></i>
                                    </button>
                                    {menuOpen && (
                                        <>
                                            <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                                            <div className="cb-menu__list translate-menu" role="menu">
                                                {notebooks.length === 0 ? (
                                                    <Link to="/account" className="inbox-item__nobooks">
                                                        Create a notebook first
                                                    </Link>
                                                ) : notebooks.map((name) => (
                                                    <button key={name} type="button" role="menuitem"
                                                        onClick={() => onMove(name)}>
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </span>
                                <button type="button" className="cb-btn cb-btn--ghost" disabled={busy} onClick={onRemove}>
                                    Remove
                                </button>
                            </div>
                        </div>

                        {item.type === 'card' ? (
                            // Someone else's HTML: always through the same
                            // DOMPurify sanitizer as your own notes, never raw.
                            <div className="card-content card-content--scroll" ref={contentRef}
                                dangerouslySetInnerHTML={{ __html: sanitizeCardHtml(item.content) }} />
                        ) : definitions && Object.entries(definitions).map(([source, list]) => (
                            <div key={source}>
                                <div><em className="source-dictionary">{source}</em></div>
                                <ul>
                                    {list.map((text, index) => <Definition text={text} key={`${source}${index}`} />)}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function mapStateToProps({ inbox, wordbooks }) {
    return { inbox, wordbooks };
}

export default connect(mapStateToProps, {
    fetchInbox, fetchInboxItem, moveInboxItem, removeInboxItem, fetchWordbooks, lookupWord,
})(requireAuth(InboxPage));
