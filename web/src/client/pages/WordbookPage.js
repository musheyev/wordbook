import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import {
    SET_CURRENT_WORDBOOK, fetchWordbookWords, fetchCardData, fetchWordData,
    clearCurrentSelection, closeCardEditor,
} from '../actions';
import SearchResult from '../components/SearchResult';
import CardEditorInline from '../components/CardEditorInline';
import NotebookMenu from '../components/NotebookMenu';
import NotebookItemList from '../components/NotebookItemList';
import AddItemSheet from '../components/AddItemSheet';
import { itemPath, notebookPath } from '../utils/notebookPaths';

// A notebook. With no item in the URL it shows the item list (on desktop the
// list lives in the left rail, so the pane just invites a pick). With an item
// in the URL (/wordbook/<name>/<type>/<id>) it shows that item; on phones a
// back bar returns to the list.
function WordbookPage({
    dispatch, wordbookWords, wordbookWordsInProgress, cardEditorOpen,
    fetchWordbookWords, fetchCardData, fetchWordData, clearCurrentSelection, closeCardEditor,
}) {
    const { name, type, id } = useParams();
    const navigate = useNavigate();
    const [addOpen, setAddOpen] = useState(false);
    // Name of the notebook whose list has finished loading, so a list left over
    // from the previous notebook is never mistaken for this one's.
    const [loadedFor, setLoadedFor] = useState(null);

    useEffect(() => {
        dispatch({ type: SET_CURRENT_WORDBOOK, payload: name });
        closeCardEditor();
        setLoadedFor(null);
        let cancelled = false;
        Promise.resolve(fetchWordbookWords(name)).then(() => {
            if (!cancelled) setLoadedFor(name);
        });
        return () => { cancelled = true; };
    }, [name]);

    // Load the item named in the URL, or clear the selection on the list.
    useEffect(() => {
        if (!id) {
            clearCurrentSelection();
        } else if (type === 'card') {
            fetchCardData(id);
        } else {
            fetchWordData(id);
        }
    }, [type, id]);

    const items = wordbookWords || [];
    const listReady = loadedFor === name && !wordbookWordsInProgress;
    const index = id ? items.findIndex((item) => item.type === type && item.id === id) : -1;

    // The open item was deleted or removed from this notebook: back to the list.
    useEffect(() => {
        if (id && listReady && index === -1 && !cardEditorOpen) {
            navigate(notebookPath(name), { replace: true });
        }
    }, [id, listReady, index, cardEditorOpen]);

    const goTo = (i) => navigate(itemPath(name, items[i]), { replace: true });

    const emptyMessage = listReady && items.length === 0 ? (
        <div className="cb-detail__empty">
            This notebook is empty. Tap Add to look up a word or write a note.
        </div>
    ) : null;

    let body;
    if (cardEditorOpen) {
        body = (
            <section id="worddefinition">
                <CardEditorInline onCreated={(card) => navigate(itemPath(name, { type: 'card', id: card.card_id }))} />
            </section>
        );
    } else if (id) {
        body = (
            <>
                <div className="nb-back">
                    <Link className="nb-back__link" to={notebookPath(name)}>
                        <i className="chevron left icon" aria-hidden="true"></i>
                        <span className="nb-back__name">{name}</span>
                    </Link>
                    {index !== -1 && items.length > 1 && (
                        <div className="nb-back__nav">
                            <span className="nb-back__pos">{index + 1} of {items.length}</span>
                            <button type="button" className="nb-back__step" aria-label="Previous item"
                                disabled={index === 0} onClick={() => goTo(index - 1)}>
                                <i className="chevron up icon"></i>
                            </button>
                            <button type="button" className="nb-back__step" aria-label="Next item"
                                disabled={index === items.length - 1} onClick={() => goTo(index + 1)}>
                                <i className="chevron down icon"></i>
                            </button>
                        </div>
                    )}
                </div>
                <section id="worddefinition">
                    <SearchResult />
                </section>
            </>
        );
    } else {
        body = (
            <>
                <div className="cb-mbar">
                    <div className="cb-mbar__head">
                        <Link className="cb-mbar__back" to="/account" aria-label="My notebooks" title="My notebooks">
                            <i className="chevron left icon" aria-hidden="true"></i>
                        </Link>
                        <NotebookMenu name={name} />
                        <button type="button" className="cb-mbar__add" onClick={() => setAddOpen(true)}>
                            <i className="plus icon" aria-hidden="true"></i>Add
                        </button>
                    </div>
                    {items.length > 0 && <NotebookItemList wordbook={name} items={items} />}
                </div>
                {emptyMessage || (listReady && (
                    <div className="cb-detail__empty cb-detail__pick">
                        Pick a note or word from the list.
                    </div>
                ))}
            </>
        );
    }

    return (
        <div className={`cb-detail${cardEditorOpen ? ' cb-detail--editing' : ''}${id ? ' cb-detail--item' : ''}`}>
            {body}
            <AddItemSheet open={addOpen} wordbook={name} onClose={() => setAddOpen(false)} />
        </div>
    );
}

function mapStateToProps({ wordbookWords, wordbookWordsInProgress, cardEditor }) {
    return { wordbookWords, wordbookWordsInProgress, cardEditorOpen: cardEditor.open };
}

const mapDispatchToProps = (dispatch) => ({
    dispatch,
    fetchWordbookWords: (name) => dispatch(fetchWordbookWords(name)),
    fetchCardData: (cardId) => dispatch(fetchCardData(cardId)),
    fetchWordData: (word) => dispatch(fetchWordData(word)),
    clearCurrentSelection: () => dispatch(clearCurrentSelection()),
    closeCardEditor: () => dispatch(closeCardEditor()),
});

export default connect(mapStateToProps, mapDispatchToProps)(requireAuth(WordbookPage));
