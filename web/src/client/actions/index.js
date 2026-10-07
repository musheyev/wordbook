import shrinkImage from '../utils/shrinkImage';
import axios from 'axios';

export const FETCH_USERS = 'fetch_users';
export const fetchUsers = () => async (dispatch, getState, api) => {
  try {
    const res = await api.get('/users');
    dispatch({ type: FETCH_USERS, payload: res });
  } catch (err) {
    // 401/403 (not admin) or 500 — show an empty list rather than crashing.
    dispatch({ type: FETCH_USERS, payload: { data: [] } });
  }
};

export const FETCH_CURRENT_USER = 'fetch_current_user';
export const fetchCurrentUser = () => async (dispatch, getState, api) => {
  const res = await api.get('/auth/current_user');

  dispatch({
    type: FETCH_CURRENT_USER,
    payload: res
  });
};

export const SET_CURRENT_WORD = "set_current_word";
export const SET_CURRENT_WORD_TYPE = "set_current_word_type";
export const SET_CURRENT_WORDBOOK = "set_current_wordbook";

// Shared JSON headers for POST bodies.
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

// Clear the current word/card selection (e.g. when landing on the Words page,
// so a card viewed inside a cardbook doesn't linger there).
export const clearCurrentSelection = () => (dispatch) => {
  dispatch({ type: SET_CURRENT_WORD, payload: '' });
  dispatch({ type: SET_CURRENT_WORD_TYPE, payload: 'word' });
  dispatch({ type: FETCH_CARD_DATA, payload: null });
};

// What to tell the user when a request fails: the server's own message when
// it sent one, else whether it timed out or the connection dropped.
export const requestErrorMessage = (err, fallback = "Something went wrong. Try again.") => {
  if (err && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
    return "The server is taking too long to answer. Check your connection and try again.";
  }
  if (err && !err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  const data = err.response.data;
  if (typeof data === 'string' && data && data.length < 300 && !data.startsWith('<')) return data;
  if (data && typeof data.error === 'string') return data.error;
  return fallback;
};

export const FETCH_WORD_DATA = 'fetch_word_data';
export const PROMOTE_HISTORY_WORD = 'promote_history_word';

// Counts word/card selections. A word lookup that answers after a newer
// selection was made is ignored, so a slow answer for an earlier word never
// replaces the current one.
let latestSelection = 0;

// The word data in the store records which word it is for (`word`), so the
// word page can tell its own data from a previous word's still-loading one.
export const fetchWordData = (word) => async (dispatch, getState, api) => {
  const selection = ++latestSelection;

  dispatch({
    type: SET_CURRENT_WORD,
    payload: word
  });

  // The current selection is a dictionary word, not a card.
  dispatch({ type: SET_CURRENT_WORD_TYPE, payload: 'word' });
  dispatch({ type: FETCH_CARD_DATA, payload: null });

  // Optimistically move the searched word to the top of the recently-searched
  // list right away (the backend also persists this order). Normalized to match
  // how history is stored (trimmed + lowercased).
  const normalized = (word || '').trim().toLowerCase();
  if (getState().auth && normalized) {
    dispatch({ type: PROMOTE_HISTORY_WORD, payload: normalized });
  }

  let data;
  try {
    data = (await api.get(`/dictionary?search=${encodeURIComponent(word)}&json=y`)).data;
  } catch (err) {
    // Shown where the definitions go (the server reports "not found" the
    // same way, in `Error`), so the page never waits forever.
    data = { definitions: {}, images: [], Error: requestErrorMessage(err, "Couldn't look up this word. Try again."), retryable: true };
  }
  if (selection !== latestSelection) return;

  dispatch({
    type: FETCH_WORD_DATA,
    payload: { data: { ...data, word } }
  });

  // Signed in: the lookup also brought the user's own things for this word
  // (one request instead of five on a slow connection): their note, own
  // images, and which notebooks hold it. Source thumbs are read from the
  // word data by SearchResult. Anything missing (an older server, or a part
  // that failed there) is fetched on its own as before.
  if (!getState().auth || data.Error) return;
  const personal = data.personal || {};
  if ('note' in personal) {
    dispatch({ type: SET_WORD_NOTE, payload: { word, content: personal.note || null } });
  } else {
    dispatch(fetchWordNote(word));
  }
  if (Array.isArray(personal.myImages)) {
    dispatch({ type: SET_MY_WORD_IMAGES, payload: { word, images: personal.myImages } });
  } else {
    dispatch(fetchMyWordImages(word));
  }
  if (Array.isArray(personal.notebooks)) {
    dispatch({ type: FETCH_WORD_WORDBOOKS, payload: { data: personal.notebooks } });
  } else {
    dispatch(fetchWordWordbooks(word));
  }
};

// ---------------------------------------------------------------------------
// Per-word notes: a personal note attached to a dictionary word.
// ---------------------------------------------------------------------------
export const SET_WORD_NOTE = 'set_word_note';

export const fetchWordNote = (word) => async (dispatch, getState, api) => {
  // Clear any prior word's note first so a stale one never shows.
  dispatch({ type: SET_WORD_NOTE, payload: { word, content: null } });
  try {
    const res = await api.get(`/dictionary/note?word=${encodeURIComponent(word)}`);
    dispatch({ type: SET_WORD_NOTE, payload: { word, content: (res.data && res.data.content) || null } });
  } catch (err) {
    // leave it empty
  }
};

export const saveWordNote = (word, content) => async (dispatch, getState, api) => {
  const res = await api.post('/dictionary/note', { word, content }, JSON_HEADERS);
  dispatch({ type: SET_WORD_NOTE, payload: { word, content: (res.data && res.data.content) || null } });
};

export const deleteWordNote = (word) => async (dispatch, getState, api) => {
  await api.post('/dictionary/note/delete', { word }, JSON_HEADERS);
  dispatch({ type: SET_WORD_NOTE, payload: { word, content: null } });
};

// Per-user, per-word dictionary-source thumbs. Return the { source: 1|-1 } map;
// SearchResult keeps it in local state so voting never re-sorts the live view.
export const fetchSourceVotes = (word) => async (dispatch, getState, api) => {
  try {
    const res = await api.get(`/dictionary/source-votes?word=${encodeURIComponent(word)}`);
    return (res.data && res.data.votes) || {};
  } catch (err) {
    return {};
  }
};
export const setSourceVote = (word, source, vote) => async (dispatch, getState, api) => {
  try {
    const res = await api.post('/dictionary/source-vote', { word, source, vote }, JSON_HEADERS);
    return (res.data && res.data.votes) || {};
  } catch (err) {
    return null;
  }
};

// Look a word up without selecting it or touching search history. Used by the
// notebook's "Add" sheet to preview a word before adding it.
export const lookupWord = (word) => async (dispatch, getState, api) => {
  const res = await api.get(`/dictionary?search=${encodeURIComponent(word)}&json=y`);
  return res.data;
};

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export const FETCH_CARD_DATA = 'fetch_card_data';
export const OPEN_CARD_EDITOR = 'open_card_editor';
export const CLOSE_CARD_EDITOR = 'close_card_editor';

export const openCardEditor = (payload = {}) => ({ type: OPEN_CARD_EDITOR, payload });
export const closeCardEditor = () => ({ type: CLOSE_CARD_EDITOR });

// Floating note windows (desktop). `mode` on = clicking a note opens it in a
// draggable/resizable window instead of the main pane; several can be open.
export const TOGGLE_NOTE_WINDOW_MODE = 'toggle_note_window_mode';
export const OPEN_NOTE_WINDOW = 'open_note_window';
export const CLOSE_NOTE_WINDOW = 'close_note_window';
export const FOCUS_NOTE_WINDOW = 'focus_note_window';

export const toggleNoteWindowMode = () => ({ type: TOGGLE_NOTE_WINDOW_MODE });
export const openNoteWindow = (item) => ({ type: OPEN_NOTE_WINDOW, payload: { cardId: item.id, title: item.title } });
export const closeNoteWindow = (id) => ({ type: CLOSE_NOTE_WINDOW, payload: id });
export const focusNoteWindow = (id) => ({ type: FOCUS_NOTE_WINDOW, payload: id });

// Fetch a card's content without selecting it (used to build a notebook's
// read-aloud queue).
export const getCardContent = (cardId) => async (dispatch, getState, api) => {
  const res = await api.post('/wordbook/card/get', { card_id: cardId }, JSON_HEADERS);
  return res.data ? (res.data.content || '') : '';
};

// Load a card's content (lazy, on click) and make it the current selection.
export const fetchCardData = (cardId) => async (dispatch, getState, api) => {
  latestSelection++; // a word lookup still loading is now out of date
  dispatch({ type: SET_CURRENT_WORD, payload: cardId });
  dispatch({ type: SET_CURRENT_WORD_TYPE, payload: 'card' });
  // Clear any dictionary result so a prior word's images/definitions don't linger.
  dispatch({ type: FETCH_WORD_DATA, payload: { data: { word: cardId, definitions: {}, images: [] } } });

  const selection = latestSelection;
  let card;
  try {
    card = (await api.post('/wordbook/card/get', { card_id: cardId }, JSON_HEADERS)).data;
  } catch (err) {
    // The note view shows this with "Try again" instead of a spinner forever.
    card = { card_id: cardId, loadError: requestErrorMessage(err, "Couldn't load this note. Try again.") };
  }
  if (selection !== latestSelection) return; // a newer word or note was picked
  dispatch({ type: FETCH_CARD_DATA, payload: card });

  // Which wordbooks currently contain this card (drives the selection popup).
  dispatch(fetchWordWordbooks(cardId));
};

// Create a new card and add it to the given wordbooks in one request.
// Resolves to the new card ({ card_id, title, content }) so the caller can open it.
export const createCard = (title, content, wordbooks = []) => async (dispatch, getState, api) => {
  const res = await api.post('/wordbook/card/create', { title, content, wordbooks }, JSON_HEADERS);
  dispatch(closeCardEditor());

  const currentWordbook = getState().currentWordbook;
  if (currentWordbook) {
    await dispatch(fetchWordbookWords(currentWordbook));
  }
  return res.data;
};

// Edit an existing card. Because a card is stored once, this updates it in
// every wordbook it belongs to.
export const updateCard = (cardId, title, content) => async (dispatch, getState, api) => {
  const res = await api.post('/wordbook/card/update', { card_id: cardId, title, content }, JSON_HEADERS);

  // Refresh the open card viewer with the new content.
  dispatch({ type: FETCH_CARD_DATA, payload: res.data });
  dispatch(closeCardEditor());

  // Refresh the list so the (possibly renamed) title updates in the chip list.
  const currentWordbook = getState().currentWordbook;
  if (currentWordbook) {
    dispatch(fetchWordbookWords(currentWordbook));
  }
};

// Delete a card everywhere (from every wordbook).
export const deleteCard = (cardId) => async (dispatch, getState, api) => {
  await api.post('/wordbook/card/delete', { card_id: cardId }, JSON_HEADERS);

  dispatch(closeCardEditor());
  dispatch({ type: FETCH_CARD_DATA, payload: null });
  dispatch({ type: SET_CURRENT_WORD, payload: '' });
  dispatch({ type: SET_CURRENT_WORD_TYPE, payload: 'word' });

  const currentWordbook = getState().currentWordbook;
  if (currentWordbook) {
    dispatch(fetchWordbookWords(currentWordbook));
  }
};

// Add/remove the *current item* (word or card) to/from a wordbook. Used by the
// wordbook-selection popup so one checkbox works for both kinds.
export const addItemToWordbook = (wordbook) => async (dispatch, getState, api) => {
  const state = getState();
  if (state.currentWordType === 'card') {
    const res = await api.post('/wordbook/card/add',
      { wordbook, card_id: state.currentWord }, JSON_HEADERS);
    if (wordbook === state.currentWordbook) {
      dispatch({ type: FETCH_WORDBOOK_WORDS, payload: res });
    }
    dispatch(fetchWordWordbooks(state.currentWord));
  } else {
    dispatch(addWordbookWord(wordbook, state.currentWord));
  }
};

export const removeItemFromWordbook = (wordbook) => async (dispatch, getState, api) => {
  const state = getState();
  if (state.currentWordType === 'card') {
    const res = await api.post('/wordbook/card/remove',
      { wordbook, card_id: state.currentWord }, JSON_HEADERS);
    if (wordbook === state.currentWordbook) {
      dispatch({ type: FETCH_WORDBOOK_WORDS, payload: res });
    }
    dispatch(fetchWordWordbooks(state.currentWord));
  } else {
    dispatch(deleteWordbookWord(wordbook, state.currentWord));
  }
};

// Remove a specific card (by id) from a specific wordbook. Used by the chip's
// × button, which must target that chip regardless of the current selection.
export const deleteWordbookCard = (wordbook, cardId) => async (dispatch, getState, api) => {
  const res = await api.post('/wordbook/card/remove',
    { wordbook, card_id: cardId }, JSON_HEADERS);
  dispatch({ type: FETCH_WORDBOOK_WORDS, payload: res });

  // If the removed card was the current selection, refresh its wordbook list.
  if (getState().currentWord === cardId) {
    dispatch(fetchWordWordbooks(cardId));
  }
};

export const FETCH_USER_HISTORY = 'fetch_user_history';
export const fetchUserHistory = (word) => async (dispatch, getState, api) => {

  const res = await api.get(`/dictionary/history`);

  //console.log("user history result:");
  //console.log(res.data);

  dispatch({
    type: FETCH_USER_HISTORY,
    payload: res
  });
};

// Remove a single word from the user's search history, then reload the list.
export const deleteHistoryWord = (word) => async (dispatch, getState, api) => {
  await api.get(`/dictionary/history/delete?word=${encodeURIComponent(word)}`);
  dispatch(fetchUserHistory());
};

// Clear the whole history. There is no bulk-delete endpoint, so delete each
// distinct word (the list is deduped) and then reload.
export const clearUserHistory = () => async (dispatch, getState, api) => {
  const words = getState().userHistory || [];
  await Promise.all(
    words.map((w) => api.get(`/dictionary/history/delete?word=${encodeURIComponent(w)}`))
  );
  dispatch(fetchUserHistory());
};

export const LOGOUT_CURRENT_USER = 'logout_current_user';
export const logoutCurrentUser = () => async (dispatch, getState, api) => {

  dispatch({
    type: SET_CURRENT_WORD,
    payload: ""
  });

  const res = await api.get('auth/logout');

  dispatch({
    type: LOGOUT_CURRENT_USER,
  });

};

export const FETCH_ADMINS = 'fetch_admins';
export const fetchAdmins = () => async (dispatch, getState, api) => {
  try {
    const res = await api.get('/admins');
    dispatch({ type: FETCH_ADMINS, payload: res });
  } catch (err) {
    // 401/403 (not admin) or 500 — show an empty list rather than crashing.
    dispatch({ type: FETCH_ADMINS, payload: { data: [] } });
  }
};

export const ADD_WORDBOOK = 'add_wordbook';
export const ADD_WORDBOOK_ERROR_MESSAGE = 'add_wordbook_error_message';
export const ADD_WORDBOOK_CLEAR_ERROR_MESSAGE = 'add_wordbook_clear_error_message';

export const addWordbook = (name) => async (dispatch, getState, api) => {
  try {
    console.log("addWordbook called 1");

    const res = await api.post('/wordbook/add',
      { name },
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    console.log("addWordbook called 2");
    console.log(JSON.stringify(res.data));

    dispatch({
      type: ADD_WORDBOOK,
      payload: res
    });
    return true;

  }
  catch (err) {
    //#region error handle
    let errorMessage;
    if (!err.response || !err.response.data) {
      errorMessage = "Something went wrong."
    }
    else {
      errorMessage = err.response.data;
    }

    console.log(errorMessage);

    dispatch({
      type: ADD_WORDBOOK_ERROR_MESSAGE,
      payload: {
        action_type: ADD_WORDBOOK_ERROR_MESSAGE,
        message: errorMessage
      }
    });
    return false;

    //#endregion error handle

  }

};

// start
export const DELETE_WORDBOOK = 'delete_wordbook';
export const DELETE_WORDBOOK_ERROR_MESSAGE = 'delete_wordbook_error_message';
export const DELETE_WORDBOOK_CLEAR_ERROR_MESSAGE = 'delete_wordbook_clear_error_message';

export const deleteWordbook = (name) => async (dispatch, getState, api) => {
  try {

    console.log("deleteWordbook called 1");


    const res = await api.post('/wordbook/delete',
      { name },
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );
    console.log("deleteWordbook called");
    console.log(JSON.stringify(res.data));

    dispatch({
      type: DELETE_WORDBOOK,
      payload: res
    });

  }
  catch (err) {
    //#region error handle
    let errorMessage;
    if (!err.response || !err.response.data) {
      errorMessage = "Something went wrong."
    }
    else {
      errorMessage = err.response.data;
    }

    console.log(errorMessage);

    dispatch({
      type: DELETE_WORDBOOK_ERROR_MESSAGE,
      payload: {
        action_type: DELETE_WORDBOOK_ERROR_MESSAGE,
        message: errorMessage
      }
    });

    //#endregion error handle

  }

};
// finish

export const FETCH_WORDBOOKS = 'fetch_wordbooks';
export const fetchWordbooks = () => async (dispatch, getState, api) => {
  //console.log("fetchWordbooks called");
  const res = await api.get('/wordbook/list');

  dispatch({
    type: FETCH_WORDBOOKS,
    payload: res
  });
};

// Preview = wordbook name -> comma-joined first few words. Stored separately so
// the plain `wordbooks` name array (used elsewhere) keeps its shape.
export const FETCH_WORDBOOK_PREVIEWS = 'fetch_wordbook_previews';
export const fetchWordbookPreviews = () => async (dispatch, getState, api) => {
  const res = await api.get('/wordbook/list?preview=y');

  dispatch({
    type: FETCH_WORDBOOK_PREVIEWS,
    payload: res
  });
};

// ---------------------------------------------------------------------------
// Sorting My Notebooks
// ---------------------------------------------------------------------------

// When each notebook was last updated (a note added or edited), for the
// "Recently updated" sort: { [name]: ISO time | null }.
export const FETCH_WORDBOOK_UPDATED = 'fetch_wordbook_updated';
export const fetchWordbookUpdated = () => async (dispatch, getState, api) => {
  const res = await api.get('/wordbook/list?meta=y');
  const updated = {};
  (Array.isArray(res.data) ? res.data : []).forEach(({ name, updated: time }) => { updated[name] = time; });
  dispatch({ type: FETCH_WORDBOOK_UPDATED, payload: updated });
};

// How My Notebooks is sorted ("az" | "updated" | "custom"), saved on the
// account so every device opens with the last one used.
export const SET_NOTEBOOK_SORT = 'set_notebook_sort';
export const fetchNotebookSort = () => async (dispatch, getState, api) => {
  let sort = 'az';
  try {
    const res = await api.get('/wordbook/sort');
    if (res.data && res.data.sort) sort = res.data.sort;
  } catch (err) { /* keep the default; a preference never breaks the page */ }
  dispatch({ type: SET_NOTEBOOK_SORT, payload: sort });
};

export const saveNotebookSort = (sort) => async (dispatch, getState, api) => {
  dispatch({ type: SET_NOTEBOOK_SORT, payload: sort });
  try {
    await api.post('/wordbook/sort', { sort }, JSON_HEADERS);
  } catch (err) { /* the list is already re-sorted; it just won't be remembered */ }
};

// Save "My order" after a drag. The list moves at once; if saving fails, the
// saved order is fetched back so the screen doesn't show an order that wasn't
// kept.
export const reorderWordbooks = (names) => async (dispatch, getState, api) => {
  dispatch({ type: FETCH_WORDBOOKS, payload: { data: names } });
  try {
    await api.post('/wordbook/reorder', { wordbooks: names }, JSON_HEADERS);
  } catch (err) {
    dispatch(fetchWordbooks());
  }
};

// Rejects with an Error carrying the server's message (e.g. name already
// taken) so the rename form can show it.
export const renameWordbook = (wordbook, name) => async (dispatch, getState, api) => {
  try {
    // Time out rather than leave the rename sheet stuck on "Saving…".
    await api.post('/wordbook/rename', { wordbook, name }, { ...JSON_HEADERS, timeout: 20000 });
  } catch (err) {
    const message = err.response && typeof err.response.data === 'string' && err.response.data
      ? err.response.data
      : "Couldn't rename the notebook. Refresh the page to check whether it was renamed.";
    throw new Error(message);
  }

  if (getState().currentWordbook === wordbook) {
    dispatch({ type: SET_CURRENT_WORDBOOK, payload: name.trim() });
  }
  dispatch(fetchWordbooks());
  dispatch(fetchWordbookPreviews());
};

export const ADD_WORDBOOK_WORD = 'add_wordbook_word';
export const ADD_WORDBOOK_WORD_ERROR_MESSAGE = 'add_wordbook_word_error_message';
export const ADD_WORDBOOK_WORD_CLEAR_ERROR_MESSAGE = 'add_wordbook_word_clear_error_message';

export const addWordbookWord = (wordbook, word) => async (dispatch, getState, api) => {
  try {

    //console.log("addWordbookWord called");
    const res = await api.post('/wordbook/word/add',
      { wordbook, word },
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    // The response is the item list of `wordbook`; only show it when that is
    // the notebook on screen (bookmarking into another notebook must not
    // replace the current notebook's list).
    if (wordbook === getState().currentWordbook) {
      dispatch({
        type: ADD_WORDBOOK_WORD,
        payload: res
      });
    }

    //console.log('Calling fetchWordWordbooks');
    dispatch(fetchWordWordbooks(word));

  }
  catch (err) {
    //#region error handle
    let errorMessage;
    if (!err.response || !err.response.data) {
      errorMessage = "Something went wrong."
    }
    else {
      errorMessage = err.response.data;
    }

    console.log(errorMessage);

    dispatch({
      type: ADD_WORDBOOK_WORD_ERROR_MESSAGE,
      payload: { action_type: ADD_WORDBOOK_WORD, message: errorMessage }
    });

    //#endregion error handle

  }
};

export const DELETE_WORDBOOK_WORD = 'delete_wordbook_word';
export const DELETE_WORDBOOK_WORD_ERROR_MESSAGE = 'delete_wordbook_word_error_message';
export const DELETE_WORDBOOK_WORD_CLEAR_ERROR_MESSAGE = 'delete_wordbook_word_clear_error_message';

export const deleteWordbookWord = (wordbook, word) => async (dispatch, getState, api) => {
  try {
    console.log("deleteWordbookWord called");
    console.log(`wordbook=${wordbook}`);

    const res = await api.post('/wordbook/word/delete',
      { wordbook, word },
      {
        headers: {
          'content-type': 'application/json'
        }
      });

    if (wordbook === getState().currentWordbook) {
      dispatch({
        type: DELETE_WORDBOOK_WORD,
        payload: res
      });
    }

    //console.log(`Calling ${fetchWordWordbooks}`);
    dispatch(fetchWordWordbooks(word));

  }
  catch (err) {
    //#region error handle
    let errorMessage;
    if (!err.response || !err.response.data) {
      errorMessage = "Something went wrong."
    }
    else {
      errorMessage = err.response.data;
    }

    console.log(errorMessage);

    dispatch({
      type: DELETE_WORDBOOK_WORD_ERROR_MESSAGE,
      payload: { action_type: DELETE_WORDBOOK_WORD_ERROR_MESSAGE, message: errorMessage }
    });

    //#endregion error handle

  }
};

export const FETCH_WORDBOOK_WORDS = 'fetch_wordbook_words';
export const FETCH_WORDBOOK_WORDS_IN_PROGRESS = 'fetch_wordbook_words_in_progress';

// Load a notebook's items. The list in the store records which notebook it
// is for (wordbookWordsFor), so a screen can keep showing a list it already
// has while it refreshes, and show a spinner only when it has none. A failure
// is recorded (wordbookWordsError) so the screen can offer "Try again"
// instead of waiting forever. An answer for a notebook that's no longer the
// current one is dropped.
export const FETCH_WORDBOOK_WORDS_FAILED = 'fetch_wordbook_words_failed';
export const fetchWordbookWords = (wordbookName) => async (dispatch, getState, api) => {
  dispatch({ type: FETCH_WORDBOOK_WORDS_IN_PROGRESS, payload: true });

  let res;
  try {
    res = await api.post('/wordbook/words', { wordbook: wordbookName }, JSON_HEADERS);
  } catch (err) {
    dispatch({ type: FETCH_WORDBOOK_WORDS_IN_PROGRESS, payload: false });
    dispatch({ type: FETCH_WORDBOOK_WORDS_FAILED, payload: { wordbook: wordbookName, message: requestErrorMessage(err) } });
    return;
  }

  dispatch({ type: FETCH_WORDBOOK_WORDS_IN_PROGRESS, payload: false });
  if (getState().currentWordbook && getState().currentWordbook !== wordbookName) return;

  // Items are typed objects: { type: 'word'|'card', id, title, preview? }.
  // Nothing is auto-selected: the notebook opens on its item list, and the
  // item in the URL (if any) is loaded by WordbookPage.
  dispatch({
    type: FETCH_WORDBOOK_WORDS,
    payload: res,
    wordbook: wordbookName,
  });
};

// ---------------------------------------------------------------------------
// Sharing and the Inbox (API: api/routes/inboxRouter.js)
//
// The inbox list lives in the store (reducers/inboxReducer.js) so the nav
// badge, My Notebooks and the Inbox page all show the same count. Single
// items and the share/move/remove calls return their results to the caller
// instead, since only the component that asked needs them.
// ---------------------------------------------------------------------------

export const FETCH_INBOX = 'fetch_inbox';

// Turn an API error into a message to show the user: the server's own text
// when it sent one (e.g. "You can share up to 20 items a day"), else a
// generic fallback.
const apiErrorMessage = (err, fallback) =>
  err.response && typeof err.response.data === 'string' && err.response.data
    ? err.response.data
    : fallback;

// Load the signed-in user's inbox (newest first) into the store. Failures are
// ignored: a missing badge count isn't worth an error message.
export const fetchInbox = () => async (dispatch, getState, api) => {
  try {
    const res = await api.get('/inbox');
    dispatch({ type: FETCH_INBOX, payload: res.data });
  } catch (err) {
    // logged out or offline — keep whatever we had
  }
};

// Share a word or note with another user. `item` is { type: 'word'|'card', id }.
// Resolves when sent; rejects with an Error whose message can be shown as-is.
export const shareItem = (to, item) => async (dispatch, getState, api) => {
  try {
    await api.post('/inbox/share', { to, item }, JSON_HEADERS);
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Couldn't share it. Try again."));
  }
};

// One inbox item in full (a note includes its content).
export const fetchInboxItem = (id) => async (dispatch, getState, api) => {
  try {
    const res = await api.post('/inbox/get', { id }, JSON_HEADERS);
    return res.data;
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Couldn't open that item."));
  }
};

// Move an inbox item into a notebook. Resolves to { type, id } of the item as
// it now appears in that notebook, so the caller can open it there.
export const moveInboxItem = (id, wordbook) => async (dispatch, getState, api) => {
  try {
    const res = await api.post('/inbox/move', { id, wordbook }, JSON_HEADERS);
    dispatch(fetchInbox());
    return res.data;
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Couldn't move it. Try again."));
  }
};

// Delete an inbox item.
export const removeInboxItem = (id) => async (dispatch, getState, api) => {
  try {
    await api.post('/inbox/remove', { id }, JSON_HEADERS);
    dispatch(fetchInbox());
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Couldn't remove it. Try again."));
  }
};

// Save a new order for a notebook's items after a drag. `items` is the full
// list ({ type, id, title, … }) in its new order.
//
// This is an *optimistic update*: the new order goes into the store straight
// away, so the dragged row stays where it was dropped instead of snapping
// back while the request runs. The server then saves it and returns the list
// as stored. If saving fails, reloading the list puts back the order the
// server actually has, so the screen never shows an order that wasn't saved.
export const reorderWordbookItems = (wordbook, items) => async (dispatch, getState, api) => {
  dispatch({ type: FETCH_WORDBOOK_WORDS, payload: { data: items } });
  try {
    const res = await api.post('/wordbook/words/reorder',
      { wordbook, items: items.map((item) => item.id), needWordList: 'y' }, JSON_HEADERS);
    if (getState().currentWordbook === wordbook && Array.isArray(res.data)) {
      dispatch({ type: FETCH_WORDBOOK_WORDS, payload: res });
    }
  } catch (err) {
    dispatch(fetchWordbookWords(wordbook));
  }
};

// ---------------------------------------------------------------------------
// Image curation (admins only; API: api/image-curation.js)
//
// Images are shared by every user, so these change what everyone sees. The
// server checks the user is an admin; the app only shows the controls to
// admins.
// ---------------------------------------------------------------------------

export const SET_WORD_IMAGES = 'set_word_images';

// Replace the current word's image list in the store (the word page reads it
// from state.word.images).
export const setWordImages = (images) => ({ type: SET_WORD_IMAGES, payload: images });

// Server message for a failed curation request. Admin checks answer with JSON
// ({ error }), curation errors with plain text; fall back to a generic line.
const curationErrorMessage = (err, fallback) => requestErrorMessage(err, fallback);

const postCuration = async (api, url, body, fallback, options = {}) => {
  try {
    const res = await api.post(url, body, { ...JSON_HEADERS, ...options });
    return res.data;
  } catch (err) {
    throw new Error(curationErrorMessage(err, fallback));
  }
};

// Delete one image from a word. Optimistic: it disappears at once; if the
// request fails, the previous list comes back and the error is re-thrown.
export const deleteWordImage = (word, url) => async (dispatch, getState, api) => {
  const before = (getState().word && getState().word.images) || [];
  dispatch(setWordImages(before.filter((image) => image !== url)));
  try {
    const data = await postCuration(api, '/dictionary/images/delete', { word, url }, "Couldn't delete the image.");
    dispatch(setWordImages(data.images));
  } catch (err) {
    dispatch(setWordImages(before));
    throw err;
  }
};

// Undo a delete.
export const restoreWordImage = (word, url) => async (dispatch, getState, api) => {
  const data = await postCuration(api, '/dictionary/images/restore', { word, url }, "Couldn't restore the image.");
  dispatch(setWordImages(data.images));
};

// Fetch new images: `options` is { count } or { replaceAll: true }.
// Resolves to { added, requested } so the dialog can say what happened.
export const refreshWordImages = (word, options) => async (dispatch, getState, api) => {
  const data = await postCuration(api, '/dictionary/images/refresh', { word, ...options }, "Couldn't get new images.");
  dispatch(setWordImages(data.images));
  return { added: data.added, requested: data.requested };
};

// ---------------------------------------------------------------------------
// The user's own images for a word (private to them; see
// api/user-word-images.js). Kept in the store as { word, images } so the word
// page can tell its own list from a previous word's still-loading one.
// ---------------------------------------------------------------------------
export const SET_MY_WORD_IMAGES = 'set_my_word_images';
const setMyWordImages = (word, images) => ({ type: SET_MY_WORD_IMAGES, payload: { word, images } });

export const fetchMyWordImages = (word) => async (dispatch, getState, api) => {
  dispatch(setMyWordImages(word, []));
  try {
    const res = await api.get(`/word-images/mine?word=${encodeURIComponent(word)}`);
    if (getState().currentWord === word) dispatch(setMyWordImages(word, res.data.images || []));
  } catch (err) { /* logged out, or a hiccup: no own images shown */ }
};

// After an add or share: the user's list, and (when the reply has them) the
// word's shared images.
const applyWordImageReply = (dispatch, getState, word, data) => {
  dispatch(setMyWordImages(word, data.images || []));
  if (Array.isArray(data.shared) && getState().currentWord === word) dispatch(setWordImages(data.shared));
};

// Add an image from the device. `shared` (admins): straight into the word's
// shared images. Rejects with the server's message.
export const uploadWordImage = (word, original, shared) => async (dispatch, getState, api) => {
  const file = await shrinkImage(original); // large photos get much smaller
  try {
    const res = await api.post(
      `/word-images/upload?word=${encodeURIComponent(word)}${shared ? '&shared=1' : ''}`,
      file, { headers: { 'content-type': file.type || 'application/octet-stream' }, timeout: 120000 });
    applyWordImageReply(dispatch, getState, word, res.data);
  } catch (err) {
    throw new Error(curationErrorMessage(err, "Couldn't add the image."));
  }
};

// Add an image from a web address: the server saves its own copy.
export const addWordImageFromLink = (word, url, shared) => async (dispatch, getState, api) => {
  // The server downloads the image itself (up to 20s), so allow longer.
  const data = await postCuration(api, '/word-images/link', { word, url, shared: Boolean(shared) },
    "Couldn't add the image from that address.", { timeout: 45000 });
  applyWordImageReply(dispatch, getState, word, data);
};

// Remove one of the user's own images. Optimistic, like deleteWordImage.
export const removeMyWordImage = (word, url) => async (dispatch, getState, api) => {
  const mine = getState().myWordImages;
  const before = mine && mine.word === word ? mine.images : [];
  dispatch(setMyWordImages(word, before.filter((image) => image !== url)));
  try {
    const data = await postCuration(api, '/word-images/remove', { word, url }, "Couldn't remove the image.");
    dispatch(setMyWordImages(word, data.images));
  } catch (err) {
    dispatch(setMyWordImages(word, before));
    throw err;
  }
};

// Undo a remove.
export const restoreMyWordImage = (word, url) => async (dispatch, getState, api) => {
  const data = await postCuration(api, '/word-images/restore', { word, url }, "Couldn't put the image back.");
  dispatch(setMyWordImages(word, data.images));
};

// Admin: make one of their own images available to everyone.
export const shareMyWordImage = (word, url) => async (dispatch, getState, api) => {
  const data = await postCuration(api, '/word-images/share', { word, url }, "Couldn't make the image available to everyone.");
  applyWordImageReply(dispatch, getState, word, data);
};

// Admin: Brave image search on or off for the whole app.
export const SET_IMAGE_SEARCH_ENABLED = 'set_image_search_enabled';
export const fetchImageSearchEnabled = () => async (dispatch, getState, api) => {
  try {
    const res = await api.get('/admin/image-search');
    dispatch({ type: SET_IMAGE_SEARCH_ENABLED, payload: res.data.enabled !== false });
  } catch (err) { /* not an admin, or a hiccup: leave it unknown */ }
};
export const saveImageSearchEnabled = (enabled) => async (dispatch, getState, api) => {
  const data = await postCuration(api, '/admin/image-search', { enabled }, "Couldn't change image search.");
  dispatch({ type: SET_IMAGE_SEARCH_ENABLED, payload: data.enabled });
};

// Admin Images page: one page of every image in the system.
// Resolves to { images: [{ word, url }], cursor, total? }.
export const fetchAdminImages = (cursor) => async (dispatch, getState, api) => {
  try {
    const res = await api.get(`/admin/images${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    return res.data;
  } catch (err) {
    throw new Error(curationErrorMessage(err, "Couldn't load images."));
  }
};

// Admin Images page: delete the selected images ([{ word, url }]).
export const deleteAdminImages = (items) => async (dispatch, getState, api) =>
  postCuration(api, '/admin/images/delete', { items }, "Couldn't delete the images.");

// --- Note-image cleanup (admin): archive orphans / restore all / clear archive ---
const adminErr = (err, fallback) =>
  new Error((err.response && err.response.data && (err.response.data.error || err.response.data)) || fallback);

export const getImageArchive = () => async (dispatch, getState, api) => {
  try { return (await api.get('/admin/image-archive')).data; }
  catch (err) { throw adminErr(err, "Couldn't load the archive."); }
};
export const sweepImageArchive = () => async (dispatch, getState, api) => {
  try { return (await api.post('/admin/image-archive/sweep', {}, JSON_HEADERS)).data; }
  catch (err) { throw adminErr(err, "Couldn't archive images."); }
};
export const restoreImageArchive = () => async (dispatch, getState, api) => {
  try { return (await api.post('/admin/image-archive/restore', {}, JSON_HEADERS)).data; }
  catch (err) { throw adminErr(err, "Couldn't restore images."); }
};
export const clearImageArchive = () => async (dispatch, getState, api) => {
  try { return (await api.post('/admin/image-archive/clear', {}, JSON_HEADERS)).data; }
  catch (err) { throw adminErr(err, "Couldn't clear the archive."); }
};

export const FETCH_WORD_WORDBOOKS = 'fetch_word_wordbooks';
export const fetchWordWordbooks = (word) => async (dispatch, getState, api) => {
  console.log("fetchWordWordbooks called");

  const res = await api.post('/wordbook/word/wordbooks',
    { word },
    {
      headers: {
        'content-type': 'application/json'
      }
    }
  );

  console.log(`in fetchWordWordbooks: ${res.data}`);

  dispatch({
    type: FETCH_WORD_WORDBOOKS,
    payload: res
  });
};

// ---------------------------------------------------------------------------
// Tags: labels on items (a word or a note), cutting across notebooks.
// ---------------------------------------------------------------------------
export const SET_ITEM_TAGS = 'set_item_tags';
export const SET_ALL_TAGS = 'set_all_tags';

// The tags of one item; clears first so a previous item's tags never linger.
export const fetchItemTags = (type, id) => async (dispatch, getState, api) => {
  dispatch({ type: SET_ITEM_TAGS, payload: { type, id, tags: [] } });
  try {
    const res = await api.get(`/tags?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
    dispatch({ type: SET_ITEM_TAGS, payload: { type, id, tags: (res.data && res.data.tags) || [] } });
  } catch (err) {
    // leave empty
  }
};

// Replace an item's tags (title is stored so the tag browser can label it).
export const setItemTags = (type, id, tags, title) => async (dispatch, getState, api) => {
  const res = await api.post('/tags', { type, id, tags, title }, JSON_HEADERS);
  dispatch({ type: SET_ITEM_TAGS, payload: { type, id, tags: (res.data && res.data.tags) || [] } });
};

// Every tagged item (for the tag browser page).
export const fetchAllTags = () => async (dispatch, getState, api) => {
  try {
    const res = await api.get('/tags/all');
    dispatch({ type: SET_ALL_TAGS, payload: Array.isArray(res.data) ? res.data : [] });
  } catch (err) {
    dispatch({ type: SET_ALL_TAGS, payload: [] });
  }
};

// Notebooks that contain an item (word or card). Used to open a tagged note.
export const fetchItemNotebooks = (id) => async (dispatch, getState, api) => {
  const res = await api.post('/wordbook/word/wordbooks', { word: id }, JSON_HEADERS);
  return Array.isArray(res.data) ? res.data : [];
};


// export const fetchUsers = () => async dispatch => {
//   const res = await axios.get('http://react-ssr-api.herokuapp.com/users');

//   dispatch({
//       type: FETCH_USERS,
//       payload: res
//   });
// };
