import React, { useState } from "react";
import { useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import { deleteWordbook, renameWordbook } from '../actions';

function WordbookItemConfig({ name, id, preview, deleteWordbook, renameWordbook }) {
    const navigate = useNavigate();

    const [renaming, setRenaming] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [remindersOpen, setRemindersOpen] = useState(false);

    const onOpen = () => navigate(`/wordbook/${name}`);

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
        <div className="wb-card">
            <div className="wb-card__head">
                {renaming ? (
                    <form className="wb-rename" onSubmit={onRenameSubmit}>
                        <input autoFocus type="text" value={draftName}
                            onChange={(e) => setDraftName(e.target.value)} />
                        <button type="submit" className="wb-btn wb-btn--primary">Save</button>
                        <button type="button" className="wb-btn" onClick={() => setRenaming(false)}>Cancel</button>
                    </form>
                ) : (
                    <div className="wb-card__info">
                        <h4 className="wb-card__title">{name}</h4>
                        <div className="wb-card__preview">{preview ? preview : 'No words yet'}</div>
                    </div>
                )}

                {!renaming && (
                    <button className="wb-open" onClick={onOpen}>
                        <i className="right arrow icon"></i>Open
                    </button>
                )}
            </div>

            <div className="wb-actions">
                <button className="wb-action" onClick={() => setRemindersOpen((v) => !v)}>
                    <i className="bell outline icon"></i>Reminders
                </button>
                <button className="wb-action" onClick={startRename}>
                    <i className="edit icon"></i>Rename
                </button>
                <button className="wb-action wb-action--danger" onClick={() => setConfirmDelete(true)}>
                    <i className="trash icon"></i>Delete
                </button>
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
                        Delete "{name}" and all its words? This can't be undone.
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
