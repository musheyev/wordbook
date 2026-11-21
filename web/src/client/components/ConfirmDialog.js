import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Small branded confirmation dialog (replaces window.confirm). Centered modal
// with Cardbook styling. Closes on backdrop click or Escape (= cancel).
//
// Drawn straight into the page's <body> (a React "portal"), not where it's
// used. Some places that use it sit in a box that keeps everything inside it
// on its own layer: the side panel, for one, which stays put while the page
// scrolls (position: sticky). A dialog drawn in there could only be on top
// of things in that panel, so the page beside it (the notebook cards) was
// drawn over it (Log out, Delete notebook). From <body>, it covers the page.
// `overlayClassName` adds a class to the dim backdrop (e.g. to raise it above
// the quiz: quiz-leave).
function ConfirmDialog({
    open, title, message,
    confirmLabel = 'Confirm', cancelLabel = 'Cancel',
    tone = 'accent', onConfirm, onCancel, overlayClassName = '',
}) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return createPortal(
        <div className={`cb-dialog__overlay ${overlayClassName}`} onMouseDown={onCancel}>
            <div className="cb-dialog" role="dialog" aria-modal="true"
                onMouseDown={(e) => e.stopPropagation()}>
                {title && <h3 className="cb-dialog__title">{title}</h3>}
                {message && <p className="cb-dialog__msg">{message}</p>}
                <div className="cb-dialog__actions">
                    <button type="button" className="cb-btn cb-btn--ghost" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button type="button" className={`cb-btn cb-btn--${tone}`} onClick={onConfirm} autoFocus>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default ConfirmDialog;
