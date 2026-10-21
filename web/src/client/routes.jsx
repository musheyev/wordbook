import React, { Suspense, lazy, useEffect } from 'react';
import { useRoutes, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import App from './App';
import HomePage from './pages/HomePage';
import AccountPage from './pages/AccountPage';
import WordbookPage from './pages/WordbookPage';
import InboxPage from './pages/InboxPage';
import TagsPage from './pages/TagsPage';
import MorePage from './pages/MorePage';
import PrivacyPage from './pages/PrivacyPage';
import SupportPage from './pages/SupportPage';
import NotFoundPage from './pages/NotFoundPage';
import Spinner from './components/Spinner';
import { COGNITO_LOGIN, COGNITO_SIGNUP } from './utils/cognito';
import { isNativeApp } from './native/platform';
import { nativeSignIn } from './native/auth';
import { isRemembrancer } from './utils/site';

// The original /login and /signup "routes" ran window.location during render,
// which is a render-time side effect. Do the redirect in an effect instead.
const ExternalRedirect = ({ to }) => {
  useEffect(() => {
    // The iPhone app signs in in its login sheet instead (native/auth.js).
    if (isNativeApp()) nativeSignIn(to.includes('/signup') ? 'signup' : 'login');
    else window.location.href = to;
  }, [to]);
  return <div>Redirecting…</div>;
};

// Admin pages download only when an admin opens one: most visitors never
// need that code.
const loadOnDemand = (load) => {
  const Page = lazy(load);
  return function OnDemandPage(props) {
    return (
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Page {...props} />
      </Suspense>
    );
  };
};
const AdminPage = loadOnDemand(() => import('./pages/AdminPage'));
const AdminImagesPage = loadOnDemand(() => import('./pages/AdminImagesPage'));
const AdminImageCleanupPage = loadOnDemand(() => import('./pages/AdminImageCleanupPage'));
const AdminAudioCleanupPage = loadOnDemand(() => import('./pages/AdminAudioCleanupPage'));
const UsersListPage = loadOnDemand(() => import('./pages/UsersListPage'));
const AdminsListPage = loadOnDemand(() => import('./pages/AdminsListPage'));

// The site's home page (utils/site.js). Make Your Wordbook opens on the Words
// search; Remembrancer opens on My Notebooks once signed in (its Words search
// is at /words). Signed out, both show the Words page's intro (Landing).
const SiteHome = () => {
  const auth = useSelector((state) => state.auth);
  if (!isRemembrancer) return <HomePage />;
  if (auth === null) return <Spinner label="Loading…" />;
  if (auth) return <Navigate to="/account" replace />;
  return <HomePage />;
};

// My Wordbooks: My Notebooks' page, listing wordbooks (pages/AccountPage.js).
const WordbooksPage = () => <AccountPage kind="wordbook" />;

const LoginRedirect = () => <ExternalRedirect to={COGNITO_LOGIN} />;
const SignupRedirect = () => <ExternalRedirect to={COGNITO_SIGNUP} />;

export const routes = [
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: SiteHome },
      { path: 'words', Component: HomePage },
      { path: 'account', Component: AccountPage },
      { path: 'wordbooks', Component: WordbooksPage },
      { path: 'wordbook/:name', Component: WordbookPage },
      { path: 'wordbook/:name/:type/:id', Component: WordbookPage },
      { path: 'inbox', Component: InboxPage },
      { path: 'inbox/:id', Component: InboxPage },
      { path: 'tags', Component: TagsPage },
      { path: 'more', Component: MorePage },
      // Open to everyone, signed in or not (App Store requirements).
      { path: 'privacy', Component: PrivacyPage },
      { path: 'support', Component: SupportPage },
      { path: 'admin', Component: AdminPage },
      { path: 'admin/images', Component: AdminImagesPage },
      { path: 'admin/image-cleanup', Component: AdminImageCleanupPage },
      { path: 'admin/audio-cleanup', Component: AdminAudioCleanupPage },
      { path: 'users', Component: UsersListPage },
      { path: 'admins', Component: AdminsListPage },
      { path: 'login', Component: LoginRedirect },
      { path: 'signup', Component: SignupRedirect },
      { path: '*', Component: NotFoundPage },
    ],
  },
];

export const AppRoutes = () => useRoutes(routes);
