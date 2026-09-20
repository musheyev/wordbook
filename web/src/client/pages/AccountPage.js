import React, { Component } from 'react';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordbookPreviews } from '../actions';
import AddWordbook from '../components/AddWordbook';
import WordbookItemConfig from '../components/WordbookItemConfig';
import requireAuth from '../components/hocs/requireAuth';

class AccountPage extends Component {
    componentDidMount() {
        this.props.fetchWordbooks();
        this.props.fetchWordbookPreviews();
    }

    render() {
        const wordbooks = this.props.wordbooks;
        const hasBooks = Array.isArray(wordbooks) && wordbooks.length > 0;

        return (
            <div className="cb-account">
                <div className="cb-account__head">
                    <h1 className="cb-page-title">My Cardbooks</h1>
                </div>

                <AddWordbook />

                {hasBooks ? (
                    <div className="cb-grid">
                        {wordbooks.map((wordbook, index) => (
                            <WordbookItemConfig key={wordbook} name={wordbook} id={index} />
                        ))}
                    </div>
                ) : Array.isArray(wordbooks) ? (
                    <div className="cb-empty">
                        No cardbooks yet — create one above to start collecting words and cards.
                    </div>
                ) : ""}
            </div>
        );
    }
}

function mapStatetoProps({ auth, wordbooks }) {
    return { auth, wordbooks };
}

export default connect(mapStatetoProps, { fetchWordbooks, fetchWordbookPreviews })(requireAuth(AccountPage));
