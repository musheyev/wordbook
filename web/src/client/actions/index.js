import axios from 'axios';

export const FETCH_USERS = 'fetch_users';
export const fetchUsers = () => async (dispatch, getState, api) => {
  const res = await api.get('/users');

  dispatch({
    type: FETCH_USERS,
    payload: res
  });
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
export const SET_CURRENT_WORDBOOK = "set_current_wordbook";

export const FETCH_WORD_DATA = 'fetch_word_data';
export const fetchWordData = (word) => async (dispatch, getState, api) => {

  dispatch({
    type: SET_CURRENT_WORD,
    payload: word
  });

  const res = await api.get(`/dictionary?search=${word}&json=y`);

  //console.log("word search result:");
  //console.log(res);

  dispatch({
    type: FETCH_WORD_DATA,
    payload: res
  });
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
  const res = await api.get('/admins');

  dispatch({
    type: FETCH_ADMINS,
    payload: res
  });
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

export const renameWordbook = (wordbook, name) => async (dispatch, getState, api) => {
  await api.post('/wordbook/rename',
    { wordbook, name },
    { headers: { 'content-type': 'application/json' } }
  );
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

    dispatch({
      type: ADD_WORDBOOK_WORD,
      payload: res
    });

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

    dispatch({
      type: DELETE_WORDBOOK_WORD,
      payload: res
    });

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

  dispatch({
    type: FETCH_WORDBOOK_WORDS,
    payload: res
  });

  //need to set current word if blank or does not exist in the current wordbook

  const currentWordInState = getState()["currentWord"];
  if (res.data.length > 0) {
    if (currentWordInState == "" || res.data.indexOf(currentWordInState) == -1) {

      const newCurrentWord = res.data[0];
      dispatch({
        type: SET_CURRENT_WORD,
        payload: newCurrentWord
      });

      dispatch(fetchWordData(newCurrentWord));
    }
  }

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
