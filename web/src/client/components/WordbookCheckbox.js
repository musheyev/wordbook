import React from "react";
import { connect } from 'react-redux';
import requireAuth from './hocs/requireAuth';
import { addItemToWordbook, removeItemFromWordbook } from '../actions';

function WordbookCheckbox(props) {

    function handleOnChange(e) {
        const wordbookName = e.target.name;
        const isChecked = e.target.checked;

        // Works for the current item whether it is a word or a card.
        if (isChecked) {
            props.addItemToWordbook(wordbookName);
        }
        else {
            props.removeItemFromWordbook(wordbookName);
        }

    }
  
    return (
        <div className="wordbook-checkbox">
            <input type="checkbox" id={`Wordbook${props.id}`} name={props.wordbookName} value="No" defaultChecked={props.checked}
                onChange={handleOnChange}/>
            <label htmlFor={`Wordbook${props.id}`}> {props.wordbookName}</label><br></br>
         </div>
 );
}

function mapStatetoProps(state, ownProps) {

    // if (ownProps.wordbookName === 'this is a test2') {
    //     console.log("WordbookCheckbox for 'this is a test2' mapStatetoProps called");

    // }
    // console.log("WordbookCheckbox mapStatetoProps");
    // console.log(state.currentWord);
    // console.log(state.wordWorkbooks);

    return { currentWord: state.currentWord, 
        errorAPI : state.errorAPI, 
        checked: (state.wordWorkbooks != null && state.wordWorkbooks != undefined ? state.wordWorkbooks.includes(ownProps.wordbookName) : false), 
        
        wordbookName: ownProps.wordbookName};
}
//wordWorkbooks: state.wordWorkbooks,
export default connect(mapStatetoProps, { addItemToWordbook, removeItemFromWordbook })(requireAuth(WordbookCheckbox));