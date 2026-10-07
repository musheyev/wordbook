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
import './client/fonts.js';
import './styles.css';

// All API calls go through /api, which Vite proxies to the backend on :4000.
//
// Slow or dropped connections: every request gives up after 20 seconds
// (rather than waiting forever), so the screen can say so and offer "Try
// again". Slower requests (image uploads) set their own, longer timeout.
// A read (GET) that failed because the connection dropped or timed out is
// retried once, after a second, before giving up: reads are safe to repeat;
// saves (POST) are not retried automatically, since repeating one could do
// it twice.
const axiosInstance = axios.create({
  baseURL: '/api',
  timeout: 20000,
});
axiosInstance.interceptors.response.use(null, async (error) => {
  const config = error.config;
  const connectionProblem = !error.response; // timeout or network error
  if (config && connectionProblem && (config.method || 'get') === 'get' && !config.__retried) {
    config.__retried = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return axiosInstance(config);
  }
  return Promise.reject(error);
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
