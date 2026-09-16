//import { ReactReduxContext } from "react-redux";
import { combineReducers } from 'redux';
import usersReducer from './userReducer';
import authReducer from './authReducer';
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

export default combineReducers({
    users: usersReducer,
    auth : authReducer,
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
    wordWorkbooks: wordWordbooksReducer
    
});