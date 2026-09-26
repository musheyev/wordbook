import React, { useState } from 'react';

// "Translate" dropdown: each language opens Google Translate (English ->
// language) for the word in a new tab.
const LANGUAGES = [
    { name: 'Russian', code: 'ru' },
    { name: 'Spanish', code: 'es' },
    { name: 'French', code: 'fr' },
    { name: 'Italian', code: 'it' },
    { name: 'Ukrainian', code: 'uk' },
    { name: 'Croatian', code: 'hr' },
    { name: 'Serbian', code: 'sr' },
];

const translateUrl = (word, code) =>
    `https://translate.google.com/?sl=en&tl=${code}&text=${encodeURIComponent(word)}&op=translate`;

function TranslateMenu({ word }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <span className="cb-menu">
            <button type="button" className="card-tool card-tool--translate"
                aria-haspopup="menu" aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}>
                Translate
                <i className={`chevron ${menuOpen ? 'up' : 'down'} icon`} aria-hidden="true"></i>
            </button>
            {menuOpen && (
                <>
                    <div className="cb-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
                    <div className="cb-menu__list translate-menu" role="menu">
                        {LANGUAGES.map((lang) => (
                            <a key={lang.code} role="menuitem" target="_blank" rel="noopener noreferrer"
                                href={translateUrl(word, lang.code)}
                                onClick={() => setMenuOpen(false)}>
                                {lang.name}
                            </a>
                        ))}
                    </div>
                </>
            )}
        </span>
    );
}

export default TranslateMenu;
