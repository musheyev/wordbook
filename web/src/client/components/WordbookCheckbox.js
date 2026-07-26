import React from "react";
import { connect } from 'react-redux';
import requireAuth from './hocs/requireAuth';
import { addWordbookWord, deleteWordbookWord} from '../actions';

function WordbookCheckbox(props) {
  
    // if (props.wordbookName === 'this is a test2') {
    //     console.log(`WordbookCheckbox '${props.wordbookName}' props.checked ${props.checked}`)

    // }

    function handleOnChange(e) {
        const wordbookName = e.target.name;
        const isChecked = e.target.checked;
        //console.log(`workbookName=${wordbookName}, isChecked=${isChecked}`);

        if (isChecked) {
            props.addWordbookWord(wordbookName, props.currentWord);
        }
        else {
            props.deleteWordbookWord(wordbookName, props.currentWord);
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
export default connect(mapStatetoProps, { addWordbookWord, deleteWordbookWord })(requireAuth(WordbookCheckbox));