import React, { Component } from 'react';
import { useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import { SET_CURRENT_WORDBOOK } from '../actions';
import { fetchWordbookWords, openCardEditor } from '../actions';
import WordList from '../components/WordList';
import SearchResult from '../components/SearchResult';
import CardEditorInline from '../components/CardEditorInline';

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

        const { cardEditorOpen } = this.props;

        return (
            <div className={`cb-detail${cardEditorOpen ? ' cb-detail--editing' : ''}`}>
                {/* Mobile-only: cardbook title, add-card, and the swipeable card
                    strip. On desktop these live in the left nav rail instead.
                    Hidden while editing so the in-place editor owns the pane. */}
                <div className="cb-mbar">
                    <div className="cb-mbar__head">
                        <h1 className="cb-mbar__title">{this.props.currentWordbook}</h1>
                        <button type="button" className="cb-mbar__add" title="New card"
                            onClick={() => this.props.openCardEditor({ mode: 'create', wordbook: this.state.myWordbook })}>
                            <i className="plus icon"></i>
                        </button>
                    </div>
                    <WordList wordbook={this.state.myWordbook} />
                </div>

                {cardEditorOpen ? (
                    <section id="worddefinition">
                        <CardEditorInline />
                    </section>
                ) : this.props.wordbookWords.length != 0 ? (
                    <section id="worddefinition">
                        <SearchResult />
                    </section>
                ) : !this.props.wordbookWordsInProgress ? (
                    <div className="cb-detail__empty">
                        This cardbook is empty. Search a word and add it, or create a card.
                    </div>
                ) : ""}
            </div>
        );
    }
}

function mapStatetoProps({ auth, currentWordbook, currentWord, wordbookWords, wordbookWordsInProgress, cardEditor }, ownProps) {
    return { auth, currentWordbook, currentWord, wordbookWords, wordbookWordsInProgress, cardEditorOpen: cardEditor.open };
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