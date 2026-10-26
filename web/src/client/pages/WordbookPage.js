import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { connect, useSelector } from 'react-redux';
import requireAuth from '../components/hocs/requireAuth';
import {
    SET_CURRENT_WORDBOOK, fetchWordbookWords, fetchCardData, fetchWordData,
    clearCurrentSelection, closeCardEditor, getCardContent, fetchItemSorts, saveItemSort, fetchItemColors,
    fetchWordbookUpdated,
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
import { itemPath, notebookPath, listPathFor } from '../utils/notebookPaths';
import { cardChunks, wordTitleChunk, firstSentenceChunks, getFirstSentenceOnly } from '../utils/tts';
import { highlightFirstMatch } from '../utils/highlightMatch';
import { sortItems, DEFAULT_ITEM_SORT } from '../utils/itemSort';
import useNotebookSearch from '../utils/useNotebookSearch';
import { keyOf } from '../components/NotebookSelect';
import { getLastVisited, setLastVisited } from '../utils/lastVisited';
import { MissingLine, useAvailableItems } from '../components/DownloadBadge';

// Play all / Play selected: seconds of silence before the next note or word.
const NOTE_GAP = 2;

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
// just what the filter shows; so does the Play selected selection
// (NotebookSelect.js), shared by the overview and the phone list.
function WordbookPage({
    dispatch, wordbookWords, wordbookWordsInProgress, wordbookWordsFor, wordbookWordsError, cardEditorOpen,
    itemSorts, itemColors, fetchWordbookWords, fetchCardData, fetchWordData, clearCurrentSelection, closeCardEditor,
}) {
    const { name, type, id } = useParams();
    // The phone's back arrow returns to the list this one is on.
    const wordbookKinds = useSelector((state) => state.wordbookKinds);
    const backPath = listPathFor(name, wordbookKinds);
    const backLabel = backPath === '/wordbooks' ? 'My wordbooks' : 'My notebooks';
    // Opened directly (a link, a refresh): learn the kinds here.
    useEffect(() => {
        if (wordbookKinds === null) dispatch(fetchWordbookUpdated());
    }, [wordbookKinds, dispatch]);
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
        if (itemColors == null) dispatch(fetchItemColors());
    }, []);

    // Remember it as this notebook's last-opened item (this session), so the
    // notebook highlights it when you come back (utils/lastVisited.js).
    useEffect(() => { if (id) setLastVisited(name, type, id); }, [name, type, id]);

    // An item opens at the top: on phones the window may still be scrolled
    // from the list it was tapped in, which would hide the back bar and
    // the title.
    useEffect(() => { if (id) window.scrollTo(0, 0); }, [type, id]);

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
    const allItems = useMemo(
        () => (haveList ? sortItems(wordbookWords || [], sort, itemColors) : []),
        [haveList, wordbookWords, sort, sort === 'color' ? itemColors : null],
    );
    // In the iPhone app with no connection, only what's downloaded; `missing`
    // says how many others there are ("12 more notes aren't downloaded").
    // Everything below — the list, Play all, next/previous — uses `items`.
    const { items, missing } = useAvailableItems(name, allItems);

    // Offline changes (offline/outbox.js): once they're sent, reload this
    // notebook and its open note; a note written offline that just got its
    // real id is shown under it.
    // (Read through a ref: both events can come before this page redraws.)
    const shownRef = useRef({ name, type, id });
    shownRef.current = { name, type, id };
    useEffect(() => {
        const onSynced = () => {
            const now = shownRef.current;
            fetchWordbookWords(now.name);
            if (now.type === 'card' && now.id && !now.id.startsWith('local-')) fetchCardData(now.id);
        };
        const onIdChanged = async (e) => {
            const now = shownRef.current;
            if (now.type !== e.detail.type || now.id !== e.detail.from) return;
            // The list first, so the note is in it under its new id (else
            // the page would think it was deleted and go back to the list).
            await fetchWordbookWords(now.name);
            navigate(itemPath(now.name, { type: now.type, id: e.detail.to }), { replace: true });
        };
        window.addEventListener('offline-synced', onSynced);
        window.addEventListener('offline-id-changed', onIdChanged);
        return () => {
            window.removeEventListener('offline-synced', onSynced);
            window.removeEventListener('offline-id-changed', onIdChanged);
        };
    }, []);
    const setSort = (next) => dispatch(saveItemSort(name, next));
    const search = useNotebookSearch(name, items);
    // What the search/filter shows (all items when there's none).
    const shownItems = search.results.map((r) => r.item);
    useEffect(() => { search.setQuery(''); }, [name]);

    // Play selected: which items are ticked (keys "<type>:<id>").
    const [selecting, setSelecting] = useState(false);
    const [picked, setPicked] = useState(() => new Set());
    useEffect(() => { setSelecting(false); setPicked(new Set()); }, [name]);
    const selection = {
        selecting,
        picked,
        isPicked: (item) => picked.has(keyOf(item)),
        toggle: (item) => setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(keyOf(item))) next.delete(keyOf(item)); else next.add(keyOf(item));
            return next;
        }),
        setAll: (list) => setPicked(new Set(list.map(keyOf))),
        start: () => setSelecting(true),
        cancel: () => { setSelecting(false); setPicked(new Set()); },
    };
    // The ticked items, in the notebook's order.
    const pickedItems = items.filter((item) => picked.has(keyOf(item)));
    const listReady = haveList;
    const listFresh = haveList && !wordbookWordsInProgress;
    const loadError = !haveList && wordbookWordsError && wordbookWordsError.wordbook === name
        ? wordbookWordsError.message : null;
    const index = id ? items.findIndex((item) => item.type === type && item.id === id) : -1;

    // The open item was deleted or removed from this notebook: back to the list.
    // (Not a note written offline that's just been sent: it moves to its real
    // id instead, above.)
    useEffect(() => {
        if (id && listFresh && index === -1 && !cardEditorOpen && !id.startsWith('local-')) {
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
    // each word read on its own, with a pause (NOTE_GAP seconds) between them.
    // "First sentence only" (the ⌄ menu next to Play all) reads just that of
    // each note.
    const notebookChunks = async (list = shownItems) => {
        const firstOnly = getFirstSentenceOnly();
        const out = [];
        for (const item of list) {
            let chunks;
            if (item.type === 'card') {
                const content = await dispatch(getCardContent(item.id));
                chunks = cardChunks({ card_id: item.id, content });
                if (firstOnly) chunks = firstSentenceChunks(chunks, content);
                chunks = chunks.map((c, i) => ({ ...c, title: i === 0 ? item.title : undefined }));
            } else {
                chunks = [wordTitleChunk(item)];
            }
            if (chunks.length === 0) continue;
            if (out.length) out.push({ pause: NOTE_GAP });
            out.push(...chunks);
        }
        return out;
    };

    // Phones (the desktop overview shows its own, under its toolbar).
    const emptyMessage = listReady && items.length === 0 && !missing ? (
        <div className="cb-detail__empty cb-detail__empty--phone">
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
                        <Link className="cb-mbar__back" to={backPath} aria-label={backLabel} title={backLabel}>
                            <i className="chevron left icon" aria-hidden="true"></i>
                        </Link>
                        <NotebookMenu name={name} />
                        <button type="button" className="cb-mbar__add" onClick={() => setAddOpen(true)}>
                            <i className="plus icon" aria-hidden="true"></i>Add
                        </button>
                        {items.length > 0 && (
                            <ReadAloud getChunks={() => notebookChunks(shownItems)} title={name} label="Play all" firstSentence />
                        )}
                    </div>
                    {listReady ? (
                        items.length > 0 && (
                            <NotebookItemList wordbook={name} items={items} search={search} sort={sort} onSort={setSort}
                                selection={selection} playSelected={() => notebookChunks(pickedItems)}
                                lastKey={getLastVisited(name)} colors={itemColors} />
                        )
                    ) : loadError ? (
                        <LoadError message={loadError} onRetry={() => fetchWordbookWords(name)} />
                    ) : (
                        <Spinner label="Loading notebook…" />
                    )}
                </div>
                {emptyMessage}
                {listReady && <div className="nb-missing--phone"><MissingLine text={missing} /></div>}
                {listReady ? (
                    <NotebookOverview name={name} items={items} search={search} sort={sort} onSort={setSort}
                        selection={selection} playSelected={() => notebookChunks(pickedItems)}
                        lastKey={getLastVisited(name)} colors={itemColors} missing={missing}
                        onAdd={() => setAddOpen(true)} getReadAloudChunks={notebookChunks} />
                ) : (
                    <div className="nb-overview-loading">
                        {loadError
                            ? <LoadError message={loadError} onRetry={() => fetchWordbookWords(name)} />
                            : <Spinner label="Loading notebook…" />}
                    </div>
                )}
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

function mapStateToProps({ wordbookWords, wordbookWordsInProgress, wordbookWordsFor, wordbookWordsError, cardEditor, itemSorts, itemColors }) {
    return {
        wordbookWords, wordbookWordsInProgress, wordbookWordsFor, wordbookWordsError, cardEditorOpen: cardEditor.open, itemSorts, itemColors,
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
