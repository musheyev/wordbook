import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { fetchWordData, clearCurrentSelection, closeCardEditor, fetchWordbooks } from '../actions';
import Search from '../components/Search';
import UserHistory from '../components/UserHistory';
import SearchResult from '../components/SearchResult';
import Landing from '../components/Landing';
import WordOfTheDay from '../components/WordOfTheDay';
import GetStarted from '../components/GetStarted';

const HomePage = ({ auth, currentWord, wordbooks, fetchWordData, clearCurrentSelection, closeCardEditor, fetchWordbooks }) => {

    // Landing on Words starts fresh: drop any card/word selected elsewhere and
    // close any in-place card editor left open inside a cardbook.
    useEffect(() => {
        clearCurrentSelection();
        closeCardEditor();
    }, [clearCurrentSelection, closeCardEditor]);

    // Load the cardbook list so we can tell whether this is a brand-new user
    // (no cardbooks) and show onboarding. `wbLoaded` avoids a flash of the
    // onboarding for existing users before their list arrives.
    const [wbLoaded, setWbLoaded] = useState(false);
    useEffect(() => {
        if (auth && auth !== '') {
            Promise.resolve(fetchWordbooks()).finally(() => setWbLoaded(true));
        }
    }, [auth, fetchWordbooks]);

    // function searchWordDefinitionOld(word) {

    //     setWordToSearch(() => word);

    //     //const testData = generateTestData();
    //     //setDefinitions(() => testData);

    //     fetch(`http://localhost:4000/dictionary?search=${word}&json=y`)
    //         .then(res => res.json())
    //         .then(res => {
    //             //console.log(res.images);

    //             res.images.map(listEntry => console.log(listEntry));

    //             setData(() => res);
    //         })
    //         .catch(error => {
    //             console.log(error);
    //             setData(() => { });
    //         });



    //     //`https://apps.musheye.com/dictionary?search=trough&json=y`

    // };

    function onWordSearchRequest(word) {
        fetchWordData(word);
    };

    const loggedIn = auth != "";
    const isNewUser = wbLoaded && Array.isArray(wordbooks) && wordbooks.length === 0;

    return (
        <div className="home-page">
            {/* Search is only available once signed in. */}
            {loggedIn && <Search onSearchWordDefinition={onWordSearchRequest} />}

            {loggedIn && <UserHistory onSearchWordDefinition={onWordSearchRequest} />}

            {currentWord != "" ? (
                <SearchResult />
            ) : loggedIn ? (
                // Signed in, no word selected. Brand-new users (no cardbooks) get
                // onboarding; everyone gets the word of the day below it.
                <>
                    {isNewUser && <GetStarted onLookUp={onWordSearchRequest} />}
                    <WordOfTheDay onLookUp={onWordSearchRequest} />
                </>
            ) : (
                // Logged out: intro to what Cardbook does.
                <Landing />
            )}
        </div>
    )
};

function mapStatetoProps(state) {
    return { currentWord: state.currentWord,
             wordSearchResult: state.word,
             auth: state.auth,
             wordbooks: state.wordbooks
              };
}

export default connect(mapStatetoProps, { fetchWordData, clearCurrentSelection, closeCardEditor, fetchWordbooks })(HomePage);