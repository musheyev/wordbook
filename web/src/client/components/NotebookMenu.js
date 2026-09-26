import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbook } from '../actions';
import RenameNotebookDialog from './RenameNotebookDialog';
import ConfirmDialog from './ConfirmDialog';
import { notebookPath } from '../utils/notebookPaths';

// The notebook title as a menu button: tap it to rename, go to all notebooks,
// or delete. Used in the mobile notebook header and the desktop rail.
function NotebookMenu({ name, className = '', deleteWordbook }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // Keep whatever item is open (/wordbook/<old>/card/x -> /wordbook/<new>/card/x).
    const onRenamed = (newName) => {
        setRenaming(false);
        const rest = location.pathname.slice(notebookPath(name).length);
        navigate(notebookPath(newName) + rest, { replace: true });
    };

    const onDeleteConfirmed = async () => {
        setConfirmingDelete(false);
        await deleteWordbook(name);
        navigate('/account', { replace: true });
    };

    return (
        <div className={`nb-menu ${className}`}>
            <button type="button" className="nb-menu__title" aria-haspopup="menu" aria-expanded={menuOpen}
                title={name} onClick={() => setMenuOpen((v) => !v)}>
                <span className="nb-menu__name">{name}</span>
                <i className={`chevron ${menuOpen ? 'up' : 'down'} icon`} aria-hidden="true"></i>
            </button>

            {menuOpen && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                    <div className="cb-menu__list nb-menu__list" role="menu">
                        <button role="menuitem" onClick={() => { setMenuOpen(false); setRenaming(true); }}>
                            <i className="pencil alternate icon"></i>Rename notebook
                        </button>
                        <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/account'); }}>
                            <i className="clone outline icon"></i>All notebooks
                        </button>
                        <button role="menuitem" className="cb-menu__danger"
                            onClick={() => { setMenuOpen(false); setConfirmingDelete(true); }}>
                            <i className="trash alternate outline icon"></i>Delete notebook
                        </button>
                    </div>
                </>
            )}

            <RenameNotebookDialog open={renaming} name={name}
                onClose={() => setRenaming(false)} onRenamed={onRenamed} />

            <ConfirmDialog
                open={confirmingDelete}
                title={`Delete "${name}"?`}
                message="The notebook and its list are deleted. Notes stay in any other notebooks they're in. This can't be undone."
                confirmLabel="Delete"
                tone="danger"
                onConfirm={onDeleteConfirmed}
                onCancel={() => setConfirmingDelete(false)}
            />
        </div>
    );
}

export default connect(null, { deleteWordbook })(NotebookMenu);
