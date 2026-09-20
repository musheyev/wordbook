import React from 'react';

// Fills the Words page when no word is selected. Static for now (no backend
// word-of-the-day source yet) — "Look up" runs a normal dictionary search.
const WORD = {
    word: 'conspicuous',
    definition: 'Easy to notice; obvious. Attracting attention, as by being unusual or remarkable.',
};

const WordOfTheDay = ({ onLookUp }) => (
    <div className="wotd">
        <div className="wotd__label">Word of the day</div>
        <div className="wotd__card">
            <div className="wotd__body">
                <div className="wotd__word">{WORD.word}</div>
                <div className="wotd__def">{WORD.definition}</div>
            </div>
            <button type="button" className="cb-btn cb-btn--ghost wotd__go"
                onClick={() => onLookUp(WORD.word)}>
                Look up
            </button>
        </div>
    </div>
);

export default WordOfTheDay;
