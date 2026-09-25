import React, { useState } from "react";
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbook } from '../actions';
import RenameNotebookDialog from './RenameNotebookDialog';
import { notebookPath } from '../utils/notebookPaths';

function WordbookItemConfig({ name, id, preview, deleteWordbook }) {
    const [renaming, setRenaming] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [remindersOpen, setRemindersOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuUp, setMenuUp] = useState(false);

    // Open the menu upward when there isn't room below the button (e.g. the
    // last notebook on a phone, where the bottom tab bar would cover it).
    const MENU_HEIGHT = 150;
    const TAB_BAR_HEIGHT = 64;
    const toggleMenu = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuUp(window.innerHeight - rect.bottom < MENU_HEIGHT + TAB_BAR_HEIGHT);
        setMenuOpen((v) => !v);
    };

    const startRename = () => {
        setRenaming(true);
    };

    return (
        <div className="cb-book">
            <RenameNotebookDialog open={renaming} name={name}
                onClose={() => setRenaming(false)} onRenamed={() => setRenaming(false)} />
            <div className="cb-book__row">
                    {/* The cardbook name is the link that opens it. */}
                    <div className="cb-book__info">
                        <Link className="cb-book__title" to={notebookPath(name)}>{name}</Link>
                        <div className="cb-book__preview">{preview ? preview : 'Empty'}</div>
                    </div>

                    <div className="cb-menu">
                        <button className="cb-menu__btn" aria-label="Notebook options"
                            onClick={toggleMenu}>
                            <i className="ellipsis vertical icon"></i>
                        </button>
                        {menuOpen && (
                            <>
                                <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                                <div className={`cb-menu__list${menuUp ? ' cb-menu__list--up' : ''}`}>
                                    <button onClick={() => { setRemindersOpen((v) => !v); setMenuOpen(false); }}>
                                        <i className="bell outline icon"></i>Reminders
                                    </button>
                                    <button onClick={() => { startRename(); setMenuOpen(false); }}>
                                        <i className="edit icon"></i>Rename
                                    </button>
                                    <button className="cb-menu__danger"
                                        onClick={() => { setConfirmDelete(true); setMenuOpen(false); }}>
                                        <i className="trash icon"></i>Delete
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
            </div>

            {remindersOpen && (
                <div className="wb-panel">
                    <span className="wb-badge">Coming soon</span>
                    <div className="wb-reminders" style={{ marginTop: '8px' }}>
                        <label><input type="checkbox" disabled /> Send email reminders</label>
                        <label style={{ marginLeft: '16px' }}><input type="checkbox" disabled /> Send text reminders</label>
                        <label style={{ display: 'block', marginTop: '8px' }}>
                            Frequency{' '}
                            <select disabled defaultValue="Once a day">
                                <option>Once a day</option>
                                <option>Once a week</option>
                                <option>Once a month</option>
                            </select>
                        </label>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="wb-panel wb-confirm">
                    <div className="wb-confirm__msg">
                        Delete "{name}" and all its notes? This can't be undone.
                    </div>
                    <div className="wb-confirm__actions">
                        <button className="wb-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
                        <button className="wb-btn wb-btn--danger" onClick={() => deleteWordbook(name)}>Delete</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function mapStatetoProps({ auth, wordbookPreviews }, ownProps) {
    return {
        auth,
        name: ownProps.name,
        id: ownProps.id,
        preview: wordbookPreviews ? wordbookPreviews[ownProps.name] : undefined,
    };
}

export default connect(mapStatetoProps, { deleteWordbook })(WordbookItemConfig);
