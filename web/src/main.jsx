// Client entry point for the Make Your Wordbook SPA.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { legacy_createStore as createStore, applyMiddleware } from 'redux';
import { composeWithDevTools } from '@redux-devtools/extension';
import { withExtraArgument } from 'redux-thunk';
import { Provider } from 'react-redux';
import axios from 'axios';
import { AppRoutes } from './client/routes.jsx';
import reducers from './client/reducers';
import './styles.css';

// All API calls go through /api, which Vite proxies to the backend on :4000.
const axiosInstance = axios.create({
  baseURL: '/api',
});

const store = createStore(
  reducers,
  composeWithDevTools(applyMiddleware(withExtraArgument(axiosInstance)))
);

createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </Provider>
);
