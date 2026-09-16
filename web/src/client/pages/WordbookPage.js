import React, { Component } from 'react';
import { useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import { SET_CURRENT_WORDBOOK } from '../actions';
import { fetchWordbookWords, openCardEditor } from '../actions';
import WordList from '../components/WordList';
import SearchResult from '../components/SearchResult';

class WordbookPage extends Component {
    state = { myWordbook: '' }

    componentDidMount() {

        //console.log(`this.props.currentWordbook ==${this.props.currentWordbook}`);

        //if (this.props.currentWordbook == "") {
            //user refreshed  from address bar
            const wordbook = this.props.params.name;

            this.setState({ myWordbook: wordbook });

            this.props.dispatch({
                type: SET_CURRENT_WORDBOOK,
                payload: wordbook
            });

            this.props.fetchWordbookWords(wordbook);
        //}
        //else {
            //user navigated using a Link
        //    this.setState({ myWordbook: this.props.currentWordbook });
        //    this.props.fetchWordbookWords(this.props.currentWordbook);
        //}
    }

    onAddWordbookSubmit(name) {
        console.log(name);
    }

    render() {

        return (
            <div className="ui wordbook" style={{ marginTop: '0px' }}>


                <header id="wordbookheader" className="ui" style={{ paddingLeft: "20px", backgroundColor: "#eafaff" }}>
                    {/* <h3>Wordbook page {this.props.match.params.name} for {this.props.auth}</h3> */}

                    <form className="ui form-inline" style={{ padding: '15px 0px', marginBottom: "0px" }}>
                        <div className="field"></div>
                        <label>Wordbook Name</label>
                        <input type="text" size="40" value={this.props.currentWordbook} onChange={() => { }}>
                        </input>
                        <button type="button" className="ui button primary new-card-btn"
                            onClick={() => this.props.openCardEditor({ mode: 'create', wordbook: this.state.myWordbook })}>
                            + New card
                        </button>
                    </form>
                </header>
                {/* {console.log("wordbookWords=")} */}
                {/* {console.log(`${this.props.wordbookWords.length}`)} */}
                
                { this.props.wordbookWords.length != 0 ?
                    
                    <main id="wordbookmain" style={{ paddingTop: "0px", paddingLeft: "0px", paddingRight: "0px"}}>

                    <aside id="wordbookwords" style={{ backgroundColor: "#feffef" }}>

                        <WordList wordbook={this.state.myWordbook} />

                    </aside>
                    <section id="worddefinition" style={this.props.currentWord != "" ? { backgroundColor: "#f7fbff", flexGrow: "1"} : {}} >
                        <SearchResult />
                    </section>
                </main>
                    : !this.props.wordbookWordsInProgress ? <h1 style={{ padding: "30px", margin: "auto" }}>This workbook is empty</h1> : ""
                }



            </div>
        );
    }
}

function mapStatetoProps({ auth, currentWordbook, currentWord, wordbookWords, wordbookWordsInProgress }, ownProps) {
    return { auth, currentWordbook, currentWord, wordbookWords, wordbookWordsInProgress };
}

//function loadData( { dispatch }) {
//console.log('I am trying  to load some data');
//return dispatch(fetchAdmins());
//}

const WordbookPageContainer = connect(mapStatetoProps, { fetchWordbookWords, openCardEditor })(requireAuth(WordbookPage));

// Inject the :name route param (react-router v7 no longer passes match/location as props).
const WordbookPageWithParams = (props) => {
    const params = useParams();
    return <WordbookPageContainer {...props} params={params} />;
};

export default WordbookPageWithParams;