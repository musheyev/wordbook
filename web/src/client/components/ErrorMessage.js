import React from 'react';

// NOTE: https://semantic-ui.com/collections/message.html
const ErrorMessage = (props) => {
    return (
        <div className="ui negative  message">
            {props.message}
        </div>
    )
};

export default ErrorMessage;