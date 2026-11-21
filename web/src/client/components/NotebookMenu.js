import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbook } from '../actions';
import RenameNotebookDialog from './RenameNotebookDialog';
import ConfirmDialog from './ConfirmDialog';
import ShareDialog from './ShareDialog';
import { notebookPath, listPathFor } from '../utils/notebookPaths';
import { NotebookBadge, useOffline } from './DownloadBadge';
import { NotebookDownloadItems } from './DownloadButtons';

// The notebook title with its menu: rename, share, go to all notebooks, or
// delete — and, in the iPhone app, Download / Remove download (offline/
// downloads.js), with a small ↓ beside the name once downloaded. Used in the
// mobile notebook header and the desktop rail. With no connection, what
// needs one is greyed out.
//
// By default the whole title is the menu button. With `nameLink` (the desktop
// rail), the name is a link there instead (the notebook's overview) and only
// the ⌄ beside it opens the menu.
//
// A wordbook's menu says "wordbook", and its way out goes to My Wordbooks.
//
// With `moreButton` (the phone notebook header, PhoneNotebookBar), a round ⋯
// button sits at the right end of the row too. It opens the same menu, with
// `extraItems` first ([{ key, icon, label, onClick, disabled?, note? }]:
// Reorder, Quiz). `children` go between the name and the ⋯ (the 🔍 that
// shows once the search box has scrolled away).
function NotebookMenu({
    name, className = '', nameLink, wordbookKinds, deleteWordbook, moreButton = false, extraItems = [], children = null,
}) {
    const one = wordbookKinds && wordbookKinds[name] === 'wordbook' ? 'wordbook' : 'notebook';
    const listPath = listPathFor(name, wordbookKinds);
    const navigate = useNavigate();
    const location = useLocation();
    // false, 'title' (from the name) or 'more' (from the ⋯).
    const [menuOpen, setMenuOpen] = useState(false);
    const toggle = (from) => setMenuOpen((v) => (v === from ? false : from));
    const [renaming, setRenaming] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const offline = useOffline();
    const noConnection = offline.enabled && !offline.online;
    const needsConnection = noConnection ? 'Needs a connection' : undefined;

    // Keep whatever item is open (/wordbook/<old>/card/x -> /wordbook/<new>/card/x).
    const onRenamed = (newName) => {
        setRenaming(false);
        const rest = location.pathname.slice(notebookPath(name).length);
        navigate(notebookPath(newName) + rest, { replace: true });
    };

    const onDeleteConfirmed = async () => {
        setConfirmingDelete(false);
        await deleteWordbook(name);
        navigate(listPath, { replace: true });
    };

    return (
        <div className={`nb-menu${moreButton ? ' nb-menu--bar' : ''} ${className}`}>
            {nameLink ? (
                <div className="nb-menu__split">
                    <Link className="nb-menu__link" to={nameLink} title={`${name}: all notes and words`}>
                        {name}<NotebookBadge name={name} />
                    </Link>
                    <button type="button" className="nb-menu__toggle" aria-haspopup="menu" aria-expanded={menuOpen === 'title'}
                        aria-label="Notebook options" title="Notebook options" onClick={() => toggle('title')}>
                        <i className={`chevron ${menuOpen === 'title' ? 'up' : 'down'} icon`} aria-hidden="true"></i>
                    </button>
                </div>
            ) : (
                <button type="button" className="nb-menu__title" aria-haspopup="menu" aria-expanded={menuOpen === 'title'}
                    title={name} onClick={() => toggle('title')}>
                    <span className="nb-menu__name">{name}</span>
                    <NotebookBadge name={name} />
                    <i className={`chevron ${menuOpen === 'title' ? 'up' : 'down'} icon`} aria-hidden="true"></i>
                </button>
            )}
            {moreButton && (
                <>
                    <span className="nb-menu__spacer" />
                    {children}
                    <button type="button" className="pnb__round" aria-haspopup="menu" aria-expanded={menuOpen === 'more'}
                        aria-label={`More ${one} options`} title="More" onClick={() => toggle('more')}>
                        <i className="ellipsis horizontal icon" aria-hidden="true"></i>
                    </button>
                </>
            )}

            {menuOpen && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                    <div className={`cb-menu__list nb-menu__list${menuOpen === 'more' ? ' nb-menu__list--more' : ''}`} role="menu">
                        {menuOpen === 'more' && extraItems.length > 0 && (
                            <>
                                {extraItems.map((it) => (
                                    <button key={it.key} role="menuitem" disabled={it.disabled} title={it.note}
                                        onClick={() => { setMenuOpen(false); it.onClick(); }}>
                                        <i className={`${it.icon} icon`}></i>
                                        <span className="nb-menu__label">
                                            {it.label}
                                            {it.note && <span className="nb-menu__note">{it.note}</span>}
                                        </span>
                                    </button>
                                ))}
                                <hr className="nb-menu__sep" />
                            </>
                        )}
                        <NotebookDownloadItems name={name} onPick={() => setMenuOpen(false)} />
                        <button role="menuitem" disabled={noConnection} title={needsConnection}
                            onClick={() => { setMenuOpen(false); setRenaming(true); }}>
                            <i className="pencil alternate icon"></i>Rename {one}
                        </button>
                        <button role="menuitem" disabled={noConnection} title={needsConnection}
                            onClick={() => { setMenuOpen(false); setSharing(true); }}>
                            <i className="paper plane outline icon"></i>Share {one}
                        </button>
                        <button role="menuitem" onClick={() => { setMenuOpen(false); navigate(listPath); }}>
                            <i className={`${one === 'wordbook' ? 'book' : 'clone outline'} icon`}></i>All {one}s
                        </button>
                        <button role="menuitem" className="cb-menu__danger" disabled={noConnection} title={needsConnection}
                            onClick={() => { setMenuOpen(false); setConfirmingDelete(true); }}>
                            <i className="trash alternate outline icon"></i>Delete {one}
                        </button>
                    </div>
                </>
            )}

            <RenameNotebookDialog open={renaming} name={name}
                onClose={() => setRenaming(false)} onRenamed={onRenamed} />

            <ShareDialog open={sharing} item={{ type: 'notebook', id: name, title: name }}
                onClose={() => setSharing(false)} />

            <ConfirmDialog
                open={confirmingDelete}
                title={`Delete "${name}"?`}
                message={`The ${one} and its list are deleted. Notes stay in any other notebooks they're in. This can't be undone.`}
                confirmLabel="Delete"
                tone="danger"
                onConfirm={onDeleteConfirmed}
                onCancel={() => setConfirmingDelete(false)}
            />
        </div>
    );
}

export default connect(({ wordbookKinds }) => ({ wordbookKinds }), { deleteWordbook })(NotebookMenu);
