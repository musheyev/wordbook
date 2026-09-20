import React, { useEffect } from 'react';

// Small branded confirmation dialog (replaces window.confirm). Centered modal
// with Cardbook styling. Closes on backdrop click or Escape (= cancel).
function ConfirmDialog({
    open, title, message,
    confirmLabel = 'Confirm', cancelLabel = 'Cancel',
    tone = 'accent', onConfirm, onCancel,
}) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="cb-dialog__overlay" onMouseDown={onCancel}>
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
        </div>
    );
}

export default ConfirmDialog;
