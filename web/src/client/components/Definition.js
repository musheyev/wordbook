import React from 'react';

function Definition(props) {

    function createMarkup() {
        return {__html: props.text};
    }

    return(
        <li dangerouslySetInnerHTML={createMarkup()} />

        
    );
}

export default Definition;