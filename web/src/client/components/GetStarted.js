import React, { useState } from 'react';
import { connect } from 'react-redux';
import { addWordbook } from '../actions';

// New-user onboarding shown on the Words page when the user has no cardbooks
// yet. Three quick steps; creating the first cardbook (step 2) makes this panel
// go away (the parent stops rendering it once a cardbook exists).
const GetStarted = ({ onLookUp, addWordbook }) => {
    const [name, setName] = useState('');

    const createCardbook = (e) => {
        e.preventDefault();
        const n = name.trim();
        if (n === '') return;
        addWordbook(n);
        setName('');
    };

    return (
        <div className="cb-onboard">
            <div className="cb-onboard__head">
                <div className="cb-onboard__title">Welcome to Remembrancer</div>
                <div className="cb-onboard__sub">Three quick steps to get going.</div>
            </div>

            <div className="cb-onboard__steps">
                <div className="cb-step">
                    <span className="cb-step__num">1</span>
                    <div className="cb-step__body">
                        <div className="cb-step__title">Look up a word</div>
                        <div className="cb-step__text">Search any word for definitions and images.</div>
                    </div>
                    <button type="button" className="cb-btn cb-btn--accent cb-step__action"
                        onClick={() => onLookUp('conspicuous')}>
                        Try “conspicuous”
                    </button>
                </div>

                <div className="cb-step">
                    <span className="cb-step__num">2</span>
                    <div className="cb-step__body">
                        <div className="cb-step__title">Create a notebook</div>
                        <div className="cb-step__text">A place to group your words and notes.</div>
                        <form className="cb-step__form" onSubmit={createCardbook}>
                            <input className="cb-step__input" type="text" placeholder="Notebook name"
                                value={name} onChange={(e) => setName(e.target.value)} />
                            <button type="submit" className="cb-btn cb-btn--accent"
                                disabled={name.trim() === ''}>Create</button>
                        </form>
                    </div>
                </div>

                <div className="cb-step cb-step--locked">
                    <span className="cb-step__num">3</span>
                    <div className="cb-step__body">
                        <div className="cb-step__title">Write your first note</div>
                        <div className="cb-step__text">Open a notebook and tap ＋ to add a rich note.</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default connect(null, { addWordbook })(GetStarted);
