import React, { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import App from './App';
import HomePage from './pages/HomePage';
import AccountPage from './pages/AccountPage';
import WordbookPage from './pages/WordbookPage';
import UsersListPage from './pages/UsersListPage';
import AdminsListPage from './pages/AdminsListPage';
import NotFoundPage from './pages/NotFoundPage';
import { COGNITO_LOGIN, COGNITO_SIGNUP } from './utils/cognito';

// The original /login and /signup "routes" ran window.location during render,
// which is a render-time side effect. Do the redirect in an effect instead.
const ExternalRedirect = ({ to }) => {
  useEffect(() => {
    window.location.href = to;
  }, [to]);
  return <div>Redirecting…</div>;
};

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
      { path: 'users', Component: UsersListPage },
      { path: 'admins', Component: AdminsListPage },
      { path: 'login', Component: LoginRedirect },
      { path: 'signup', Component: SignupRedirect },
      { path: '*', Component: NotFoundPage },
    ],
  },
];

export const AppRoutes = () => useRoutes(routes);
