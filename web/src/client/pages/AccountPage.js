import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { fetchWordbooks, fetchWordbookPreviews, fetchInbox } from '../actions';
import AddWordbook from '../components/AddWordbook';
import WordbookItemConfig from '../components/WordbookItemConfig';
import requireAuth from '../components/hocs/requireAuth';

class AccountPage extends Component {
    componentDidMount() {
        this.props.fetchWordbooks();
        this.props.fetchWordbookPreviews();
        this.props.fetchInbox();
    }

    render() {
        const wordbooks = this.props.wordbooks;
        const hasBooks = Array.isArray(wordbooks) && wordbooks.length > 0;
        const inboxCount = Array.isArray(this.props.inbox) ? this.props.inbox.length : 0;

        return (
            <div className="cb-account">
                <div className="cb-account__head">
                    <h1 className="cb-page-title">My Notebooks</h1>
                </div>

                {/* The Inbox is pinned above the notebooks. It isn't a notebook
                    (it lives in its own table; see api/inbox.js), so it can't be
                    renamed, deleted or reordered. */}
                <Link to="/inbox" className="inbox-card">
                    <span className="inbox-card__icon" aria-hidden="true">
                        <i className="inbox icon"></i>
                    </span>
                    <span className="inbox-card__text">
                        <span className="inbox-card__title">Inbox</span>
                        <span className="inbox-card__sub">
                            {inboxCount === 0 ? 'Words and notes shared with you'
                                : `${inboxCount} shared with you`}
                        </span>
                    </span>
                    {inboxCount > 0 && <span className="inbox-badge">{inboxCount}</span>}
                    <i className="chevron right icon inbox-card__chev" aria-hidden="true"></i>
                </Link>

                <AddWordbook />

                {hasBooks ? (
                    <div className="cb-grid">
                        {wordbooks.map((wordbook, index) => (
                            <WordbookItemConfig key={wordbook} name={wordbook} id={index} />
                        ))}
                    </div>
                ) : Array.isArray(wordbooks) ? (
                    <div className="cb-empty">
                        No notebooks yet — create one above to start collecting words and notes.
                    </div>
                ) : ""}
            </div>
        );
    }
}

function mapStatetoProps({ auth, wordbooks, inbox }) {
    return { auth, wordbooks, inbox };
}

export default connect(mapStatetoProps, { fetchWordbooks, fetchWordbookPreviews, fetchInbox })(requireAuth(AccountPage));
