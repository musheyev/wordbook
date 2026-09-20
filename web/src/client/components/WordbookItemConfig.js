import React, { useState } from "react";
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbook, renameWordbook } from '../actions';

function WordbookItemConfig({ name, id, preview, deleteWordbook, renameWordbook }) {
    const [renaming, setRenaming] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [remindersOpen, setRemindersOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const onRenameSubmit = (e) => {
        e.preventDefault();
        const next = draftName.trim();
        if (next && next !== name) {
            renameWordbook(name, next);
        }
        setRenaming(false);
    };

    const startRename = () => {
        setDraftName(name);
        setRenaming(true);
    };

    return (
        <div className="cb-book">
            {renaming ? (
                <form className="wb-rename" onSubmit={onRenameSubmit}>
                    <input autoFocus type="text" value={draftName}
                        onChange={(e) => setDraftName(e.target.value)} />
                    <button type="submit" className="wb-btn wb-btn--primary">Save</button>
                    <button type="button" className="wb-btn" onClick={() => setRenaming(false)}>Cancel</button>
                </form>
            ) : (
                <div className="cb-book__row">
                    {/* The cardbook name is the link that opens it. */}
                    <div className="cb-book__info">
                        <Link className="cb-book__title" to={`/wordbook/${name}`}>{name}</Link>
                        <div className="cb-book__preview">{preview ? preview : 'Empty'}</div>
                    </div>

                    <div className="cb-menu">
                        <button className="cb-menu__btn" aria-label="Notebook options"
                            onClick={() => setMenuOpen((v) => !v)}>
                            <i className="ellipsis vertical icon"></i>
                        </button>
                        {menuOpen && (
                            <>
                                <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                                <div className="cb-menu__list">
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
            )}

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

export default connect(mapStatetoProps, { deleteWordbook, renameWordbook })(WordbookItemConfig);
