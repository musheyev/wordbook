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
import { siteUrl } from './client/native/platform';
import { installNativeAuth } from './client/native/auth';
import { installOffline } from './client/offline/downloads';
import reducers from './client/reducers';
import './client/fonts.js';
import './styles.css';

// All API calls go through /api, which Vite proxies to the backend on :4000
// (and CloudFront to the Lambda on the website). Inside the iPhone app it's
// https://makeyourwordbook.com/api (client/native/platform.js).
//
// Slow or dropped connections: every request gives up after 20 seconds
// (rather than waiting forever), so the screen can say so and offer "Try
// again". Slower requests (image uploads) set their own, longer timeout.
// A read (GET) that failed because the connection dropped or timed out is
// retried once, after a second, before giving up: reads are safe to repeat;
// saves (POST) are not retried automatically, since repeating one could do
// it twice.
const axiosInstance = axios.create({
  baseURL: siteUrl('/api'),
  timeout: 20000,
});
axiosInstance.interceptors.response.use(null, async (error) => {
  const config = error.config;
  const connectionProblem = !error.response; // timeout or network error
  // (Not when we know we're offline: offline/apiCache.js already answered.)
  if (config && connectionProblem && !error.isOffline && (config.method || 'get') === 'get' && !config.__retried) {
    config.__retried = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return axiosInstance(config);
  }
  return Promise.reject(error);
});

// Inside the iPhone app: sign-in, and the token on every request.
installNativeAuth(axiosInstance);

const store = createStore(
  reducers,
  composeWithDevTools(applyMiddleware(withExtraArgument(axiosInstance)))
);

// Inside the iPhone app: downloads and saved copies for offline use
// (client/offline/). The first screen waits for the list of what's
// downloaded — a quick read from the phone — so it shows the right notes.
const render = () => createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </Provider>
);
installOffline(store, axiosInstance).catch(() => {}).finally(render);
