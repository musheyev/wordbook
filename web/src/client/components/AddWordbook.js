import React from 'react'
import { connect } from 'react-redux';
import requireAuth from './hocs/requireAuth';
import { addWordbook, ADD_WORDBOOK_CLEAR_ERROR_MESSAGE, ADD_WORDBOOK_ERROR_MESSAGE } from '../actions';
import ErrorMessage from './ErrorMessage';

class AddWordbook extends React.Component {
    
    state = { name: ''}

    isEmptyOrSpaces = (str) => {

        return str === undefined || str === null || str.match(/^ *$/) !== null;
    }

    onFormSubmit = (event) => {
        event.preventDefault();

        //this.props.onSubmit(this.state.name);
        const newWordbookName = this.state.name.trim();
        
        if (newWordbookName != "") {
            this.props.addWordbook(newWordbookName);
        }
    }

    onWordbookNameChange = (event => {
        this.setState({ name: event.target.value});

        if (this.props.errorAPI.message != '') {
            this.props.dispatch({
                type: ADD_WORDBOOK_CLEAR_ERROR_MESSAGE
              });
        }
    })

    render() {
        const showErrorMessage = !this.isEmptyOrSpaces(this.props.errorAPI.message) && 
            this.props.errorAPI.action_type === ADD_WORDBOOK_ERROR_MESSAGE;

        return (
            <div className="ui segment">
                <form className="ui form-inline" onSubmit={this.onFormSubmit}>
                    <div className="field"></div>
                    <label>{this.isEmptyOrSpaces(this.props.displayLabel) ? "Wordbook Name" : this.props.displayLabel}</label>
                    <input type="text" size="40" value={this.state.name} 
                     onChange={this.onWordbookNameChange}></input>
                    <button>Add</button>
                </form>
                {showErrorMessage ? <ErrorMessage message={this.props.errorAPI.message}/> : ""}
            </div>
            );
    }
}

function mapStatetoProps(state, ownProps) {
    return { auth: state.auth, errorAPI : state.errorAPI, displayLabel: ownProps.displayLabel};
}

export default connect(mapStatetoProps, { addWordbook })(requireAuth(AddWordbook));