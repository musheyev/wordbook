import React from 'react';
import CardEditorInline from './CardEditorInline';

/**
 * "New note in <notebook>": the side panel's + (Header.js) opens this popup
 * to write a note without leaving the note you're reading. It's the same
 * editor as the page's (CardEditorInline), in its `popup` mode: Save adds the
 * note to this notebook and closes the popup, the note appears in the side
 * panel's list, and the page keeps showing what it showed before.
 *
 * The popup closes only through the editor's ✕ (Cancel) or Save, not by
 * clicking outside it, so a stray click can't throw away a half-written
 * note. (Text not yet saved is also kept on this device: useDraft.)
 *
 * Desktop only, like the side panel. On phones, Add opens AddItemSheet.
 *
 * @param {boolean} open
 * @param {string} wordbook the notebook the note goes into
 * @param {() => void} onClose
 * @param {() => void} onLookUpWord swap this popup for the Add sheet, to
 *   look up a word and add it instead of writing a note
 */
export default function NewNotePopup({ open, wordbook, onClose, onLookUpWord }) {
    if (!open) return null;
    return (
        <div className="cb-sheet__overlay new-note">
            <div className="cb-sheet new-note__box" role="dialog" aria-modal="true" aria-label={`New note in ${wordbook}`}>
                <div className="cb-sheet__head">
                    <h3 className="cb-sheet__title">New note in {wordbook}</h3>
                    <button type="button" className="new-note__lookup" onClick={onLookUpWord}>
                        <i className="search icon" aria-hidden="true"></i>Look up a word instead
                    </button>
                </div>
                <CardEditorInline popup={{ wordbook, onClose }} />
            </div>
        </div>
    );
}
