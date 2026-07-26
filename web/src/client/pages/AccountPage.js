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
        return (
            <div className="ui container" style={{ marginTop: '10px' }}>
                <h3>Account settings for {this.props.auth}</h3>

                <AddWordbook />

                {this.props.wordbooks != null ? this.props.wordbooks.map((wordbook, index) => (
                    <WordbookItemConfig key={wordbook} name={wordbook} id={index} />
                )) : ""}
            </div>
        );
    }
}

function mapStatetoProps({ auth, wordbooks }) {
    return { auth, wordbooks };
}

export default connect(mapStatetoProps, { fetchWordbooks, fetchWordbookPreviews })(requireAuth(AccountPage));
