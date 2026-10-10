import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import {
    SET_CURRENT_WORDBOOK, fetchWordbookWords, fetchCardData, fetchWordData,
    clearCurrentSelection, closeCardEditor, getCardContent, fetchItemSorts, saveItemSort,
} from '../actions';
import SearchResult from '../components/SearchResult';
import CardEditorInline from '../components/CardEditorInline';
import NotebookMenu from '../components/NotebookMenu';
import NotebookItemList from '../components/NotebookItemList';
import AddItemSheet from '../components/AddItemSheet';
import ReadAloud from '../components/ReadAloud';
import NotebookOverview from '../components/NotebookOverview';
import Spinner from '../components/Spinner';
import LoadError from '../components/LoadError';
import { itemPath, notebookPath } from '../utils/notebookPaths';
import { cardChunks } from '../utils/tts';
import { highlightFirstMatch } from '../utils/highlightMatch';
import { sortItems, DEFAULT_ITEM_SORT } from '../utils/itemSort';
import useNotebookSearch from '../utils/useNotebookSearch';

const HEBREW = /[֐-׿]/;

// A notebook. With no item in the URL it shows the notebook: on phones its
// item list; on desktop (where the list also lives in the left rail) an
// overview of every item as a card (NotebookOverview). With an item in the
// URL (/wordbook/<name>/<type>/<id>) it shows that item, under a back bar
// that returns to the notebook and steps to the previous/next item. A spinner
// shows while the list loads.
//
// Everything follows the notebook's chosen sort (utils/itemSort.js): the
// overview, the phone list, stepping between items and Play all. The search
// box and its filter (useNotebookSearch) live here too, so Play all reads
// just what the filter shows.
function WordbookPage({
    dispatch, wordbookWords, wordbookWordsInProgress, wordbookWordsFor, wordbookWordsError, cardEditorOpen,
    itemSorts, fetchWordbookWords, fetchCardData, fetchWordData, clearCurrentSelection, closeCardEditor,
}) {
    const { name, type, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    // Opened from a notebook search result: ?q=<what was searched>.
    const searchedFor = new URLSearchParams(location.search).get('q');
    const [addOpen, setAddOpen] = useState(false);

    useEffect(() => {
        dispatch({ type: SET_CURRENT_WORDBOOK, payload: name });
        closeCardEditor();
        fetchWordbookWords(name);
    }, [name]);

    useEffect(() => {
        if (itemSorts == null) dispatch(fetchItemSorts());
    }, []);

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

    // The list in the store is this notebook's (wordbookWordsFor): show it at
    // once, even while it refreshes; a spinner only when there's none yet.
    // `listFresh` (not refreshing) guards decisions a stale list could get
    // wrong, like "the open item is gone".
    const haveList = wordbookWordsFor === name;
    const sort = (itemSorts && itemSorts[name]) || DEFAULT_ITEM_SORT;
    const items = useMemo(
        () => (haveList ? sortItems(wordbookWords || [], sort) : []),
        [haveList, wordbookWords, sort],
    );
    const setSort = (next) => dispatch(saveItemSort(name, next));
    const search = useNotebookSearch(name, items);
    // What the search/filter shows (all items when there's none).
    const shownItems = search.results.map((r) => r.item);
    useEffect(() => { search.setQuery(''); }, [name]);
    const listReady = haveList;
    const listFresh = haveList && !wordbookWordsInProgress;
    const loadError = !haveList && wordbookWordsError && wordbookWordsError.wordbook === name
        ? wordbookWordsError.message : null;
    const index = id ? items.findIndex((item) => item.type === type && item.id === id) : -1;

    // The open item was deleted or removed from this notebook: back to the list.
    useEffect(() => {
        if (id && listFresh && index === -1 && !cardEditorOpen) {
            navigate(notebookPath(name), { replace: true });
        }
    }, [id, listFresh, index, cardEditorOpen]);

    // Opened from a search result: once the item's content has loaded,
    // scroll to the first match and highlight it. The content arrives after
    // the page, so look for it a few times.
    useEffect(() => {
        if (!id || !searchedFor) return undefined;
        let tries = 0;
        const timer = setInterval(() => {
            const content = document.getElementById('worddefinition');
            if (highlightFirstMatch(content, searchedFor) || ++tries >= 25) clearInterval(timer);
        }, 200);
        return () => clearInterval(timer);
    }, [type, id, searchedFor]);

    const goTo = (i) => navigate(itemPath(name, items[i]), { replace: true });

    // Build the read-aloud queue for the whole notebook: each note's body (its
    // first chunk tagged with the title so the lock screen updates per item) and
    // each word read on its own.
    const notebookChunks = async (list = shownItems) => {
        const out = [];
        for (const item of list) {
            if (item.type === 'card') {
                const content = await dispatch(getCardContent(item.id));
                cardChunks({ card_id: item.id, content }).forEach((c, i) => out.push({ ...c, title: i === 0 ? item.title : undefined }));
            } else {
                out.push({
                    text: item.title, lang: HEBREW.test(item.title) ? 'he-IL' : 'en-US', title: item.title,
                    item: `wordtitle:${item.id}`,
                });
            }
        }
        return out;
    };

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
                        {items.length > 0 && (
                            <ReadAloud getChunks={() => notebookChunks(shownItems)} title={name} label="Play all" />
                        )}
                    </div>
                    {listReady ? (
                        items.length > 0 && (
                            <NotebookItemList wordbook={name} items={items} search={search} sort={sort} onSort={setSort} />
                        )
                    ) : loadError ? (
                        <LoadError message={loadError} onRetry={() => fetchWordbookWords(name)} />
                    ) : (
                        <Spinner label="Loading notebook…" />
                    )}
                </div>
                {emptyMessage || (listReady ? (
                    <NotebookOverview name={name} items={items} search={search} sort={sort} onSort={setSort}
                        onAdd={() => setAddOpen(true)} getReadAloudChunks={notebookChunks} />
                ) : (
                    <div className="nb-overview-loading">
                        {loadError
                            ? <LoadError message={loadError} onRetry={() => fetchWordbookWords(name)} />
                            : <Spinner label="Loading notebook…" />}
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

function mapStateToProps({ wordbookWords, wordbookWordsInProgress, wordbookWordsFor, wordbookWordsError, cardEditor, itemSorts }) {
    return {
        wordbookWords, wordbookWordsInProgress, wordbookWordsFor, wordbookWordsError, cardEditorOpen: cardEditor.open, itemSorts,
    };
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
