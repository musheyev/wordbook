import React, { useState }from 'react';
import { connect } from 'react-redux';
import { fetchWordData } from '../actions';
import Search from '../components/Search';
import UserHistory from '../components/UserHistory';
import SearchResult from '../components/SearchResult';

const HomePage = ({ auth, currentWord, fetchWordData,  }) => {

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

    return (
        <div className="home-page">
            <Search onSearchWordDefinition={onWordSearchRequest} />

            {auth != "" ? <UserHistory onSearchWordDefinition={onWordSearchRequest} /> : ""}

            { currentWord != "" ? <SearchResult /> : ""}
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

export default connect(mapStatetoProps, { fetchWordData })(HomePage);