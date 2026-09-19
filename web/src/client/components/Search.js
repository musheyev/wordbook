import React from 'react';

function Search(props) {

    function handleSubmit(event) {
        event.preventDefault();
        const input = document.getElementById('searchWord');
        const value = input.value.trim();
        if (value !== '') {
            props.onSearchWordDefinition(value);
        }
        input.value = '';
    }

    return (
        <form className="cb-search" onSubmit={handleSubmit}>
            <i className="search icon cb-search__icon" aria-hidden="true"></i>
            <input type="text" id="searchWord" name="search" className="cb-search__input"
                placeholder="Search a word…" autoComplete="off" />
            <button type="submit" className="cb-search__go" aria-label="Search">
                <i className="arrow right icon" aria-hidden="true"></i>
            </button>
        </form>
    );
}

export default Search;
