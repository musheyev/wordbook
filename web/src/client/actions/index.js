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

export const FETCH_WORD_DATA = 'fetch_word_data';
export const PROMOTE_HISTORY_WORD = 'promote_history_word';
export const fetchWordData = (word) => async (dispatch, getState, api) => {

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

  const res = await api.get(`/dictionary?search=${encodeURIComponent(word)}&json=y`);

  //console.log("word search result:");
  //console.log(res);

  dispatch({
    type: FETCH_WORD_DATA,
    payload: res
  });
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

// Load a card's content (lazy, on click) and make it the current selection.
export const fetchCardData = (cardId) => async (dispatch, getState, api) => {
  dispatch({ type: SET_CURRENT_WORD, payload: cardId });
  dispatch({ type: SET_CURRENT_WORD_TYPE, payload: 'card' });
  // Clear any dictionary result so a prior word's images/definitions don't linger.
  dispatch({ type: FETCH_WORD_DATA, payload: { data: { definitions: {}, images: [] } } });

  const res = await api.post('/wordbook/card/get', { card_id: cardId }, JSON_HEADERS);
  dispatch({ type: FETCH_CARD_DATA, payload: res.data });

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

export const fetchWordbookWords = (wordbookName) => async (dispatch, getState, api) => {
  //console.log("fetchWordbookWords called");

  dispatch({
    type: FETCH_WORDBOOK_WORDS_IN_PROGRESS,
    payload: true
  });

  const res = await api.post('/wordbook/words',
    { wordbook: wordbookName },
    {
      headers: {
        'content-type': 'application/json'
      }
    }
  );

  //console.log(`in fetchWordbookWords: ${res.data}`);

  dispatch({
    type: FETCH_WORDBOOK_WORDS_IN_PROGRESS,
    payload: false
  });

  // Items are typed objects: { type: 'word'|'card', id, title, preview? }.
  // Nothing is auto-selected: the notebook opens on its item list, and the
  // item in the URL (if any) is loaded by WordbookPage.
  dispatch({
    type: FETCH_WORDBOOK_WORDS,
    payload: res
  });
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


// export const fetchUsers = () => async dispatch => {
//   const res = await axios.get('http://react-ssr-api.herokuapp.com/users');

//   dispatch({
//       type: FETCH_USERS,
//       payload: res
//   });
// };
