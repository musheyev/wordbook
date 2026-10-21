import React from 'react';
import { Link } from 'react-router-dom';

// "Privacy · Support": links to pages/PrivacyPage.js and pages/SupportPage.js.
// Apple wants the privacy policy reachable from inside the app; shown on the
// start page and in My Notebooks' Account section.
export default function LegalLinks({ className = '' }) {
    return (
        <nav className={`legal-links ${className}`} aria-label="About">
            <Link to="/privacy">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/support">Support</Link>
        </nav>
    );
}
