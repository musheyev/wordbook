import React, { Suspense, lazy, useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import App from './App';
import HomePage from './pages/HomePage';
import AccountPage from './pages/AccountPage';
import WordbookPage from './pages/WordbookPage';
import InboxPage from './pages/InboxPage';
import TagsPage from './pages/TagsPage';
import NotFoundPage from './pages/NotFoundPage';
import Spinner from './components/Spinner';
import { COGNITO_LOGIN, COGNITO_SIGNUP } from './utils/cognito';

// The original /login and /signup "routes" ran window.location during render,
// which is a render-time side effect. Do the redirect in an effect instead.
const ExternalRedirect = ({ to }) => {
  useEffect(() => {
    window.location.href = to;
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
const UsersListPage = loadOnDemand(() => import('./pages/UsersListPage'));
const AdminsListPage = loadOnDemand(() => import('./pages/AdminsListPage'));

const LoginRedirect = () => <ExternalRedirect to={COGNITO_LOGIN} />;
const SignupRedirect = () => <ExternalRedirect to={COGNITO_SIGNUP} />;

export const routes = [
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: HomePage },
      { path: 'account', Component: AccountPage },
      { path: 'wordbook/:name', Component: WordbookPage },
      { path: 'wordbook/:name/:type/:id', Component: WordbookPage },
      { path: 'inbox', Component: InboxPage },
      { path: 'inbox/:id', Component: InboxPage },
      { path: 'tags', Component: TagsPage },
      { path: 'admin', Component: AdminPage },
      { path: 'admin/images', Component: AdminImagesPage },
      { path: 'admin/image-cleanup', Component: AdminImageCleanupPage },
      { path: 'users', Component: UsersListPage },
      { path: 'admins', Component: AdminsListPage },
      { path: 'login', Component: LoginRedirect },
      { path: 'signup', Component: SignupRedirect },
      { path: '*', Component: NotFoundPage },
    ],
  },
];

export const AppRoutes = () => useRoutes(routes);
