import React, { useEffect, useState } from 'react';

// Shown while waiting for the server, so the page is never just blank.
// It appears only after DELAY_MS: most answers arrive sooner, and a spinner
// that flashes for an instant is more distracting than none.
//
//   label   text under the spinner ("Loading notebook…"); also what screen
//           readers announce
//   inline  a small spinner beside the label, for tight spots (a list)
const DELAY_MS = 200;

export default function Spinner({ label = 'Loading…', inline = false }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), DELAY_MS);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className={`cb-spinner${inline ? ' cb-spinner--inline' : ''}`} role="status" aria-live="polite">
            {visible && (
                <>
                    <span className="cb-spinner__ring" aria-hidden="true" />
                    <span className="cb-spinner__label">{label}</span>
                </>
            )}
        </div>
    );
}
