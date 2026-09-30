//import { ReactReduxContext } from "react-redux";
import { combineReducers } from 'redux';
import usersReducer from './userReducer';
import authReducer from './authReducer';
import isAdminReducer from './isAdminReducer';
import adminsReducer from './adminsReducer';
import wordReducer from "./wordReducer";
import currentWordReducer from "./currentWordReducer";
import currentWordTypeReducer from "./currentWordTypeReducer";
import currentCardReducer from "./currentCardReducer";
import cardEditorReducer from "./cardEditorReducer";
import currentWordbookReducer from "./currentWordbookReducer";
import userHistoryReducer from './userHistoryReducer';
import wordbookReducer from './wordbooksReducer';
import wordbookPreviewsReducer from './wordbookPreviewsReducer';
import wordbookWordsReducer, { wordbookWordsInProgressReducer } from './wordbookWordsReducer';
import wordWordbooksReducer from './wordWordbooksReducer';
import errorReducer from './errorReducer';
import inboxReducer from './inboxReducer';
import wordNoteReducer from './wordNoteReducer';
import itemTagsReducer from './itemTagsReducer';
import allTagsReducer from './allTagsReducer';
import noteWindowsReducer from './noteWindowsReducer';

export default combineReducers({
    users: usersReducer,
    auth : authReducer,
    isAdmin: isAdminReducer,
    admins: adminsReducer,
    word: wordReducer,
    currentWord: currentWordReducer,
    currentWordType: currentWordTypeReducer,
    currentCard: currentCardReducer,
    cardEditor: cardEditorReducer,
    currentWordbook: currentWordbookReducer,
    userHistory: userHistoryReducer,
    wordbooks: wordbookReducer,
    wordbookPreviews: wordbookPreviewsReducer,
    errorAPI: errorReducer,
    wordbookWords: wordbookWordsReducer,
    wordbookWordsInProgress: wordbookWordsInProgressReducer,
    wordWorkbooks: wordWordbooksReducer,
    inbox: inboxReducer,
    wordNote: wordNoteReducer,
    itemTags: itemTagsReducer,
    allTags: allTagsReducer,
    noteWindows: noteWindowsReducer

});