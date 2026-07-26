import React from 'react';

function Search(props) {

    function handleSubmit(event) {
        console.log("handle submit");
        event.preventDefault();

        props.onSearchWordDefinition(document.getElementById("searchWord").value);
        document.getElementById("searchWord").value = "";
        
    }

    return (
        <div className="search">
            <form className="search" action="/dictionary" method="POST" onSubmit={handleSubmit}>
                <div>
                    <input type="text" id="searchWord" name="search" placeholder="Type a word here" />
                    <button type="submit"><i className="fa fa-search"></i></button>
                </div>
            </form>
    </div>
 );
}

export default Search;