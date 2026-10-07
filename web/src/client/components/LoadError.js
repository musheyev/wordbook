import React from 'react';

// Shown instead of a screen that couldn't load (slow or dropped connection):
// what went wrong and a "Try again" button.
export default function LoadError({ message, onRetry }) {
    return (
        <div className="load-error" role="alert">
            <i className="exclamation circle icon" aria-hidden="true"></i>
            <span className="load-error__text">{message || "Couldn't load this. Try again."}</span>
            {onRetry && <button type="button" className="cb-btn" onClick={onRetry}>Try again</button>}
        </div>
    );
}
