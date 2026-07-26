import React, { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import App from './App';
import HomePage from './pages/HomePage';
import AccountPage from './pages/AccountPage';
import WordbookPage from './pages/WordbookPage';
import UsersListPage from './pages/UsersListPage';
import AdminsListPage from './pages/AdminsListPage';
import NotFoundPage from './pages/NotFoundPage';

const COGNITO_BASE =
  'https://auth.musheye.com/login?client_id=31i8vt5m567ch5ciedmeskpk67' +
  '&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile' +
  '&redirect_uri=http://localhost:4000/auth';

// The original /login and /signup "routes" ran window.location during render,
// which is a render-time side effect. Do the redirect in an effect instead.
const ExternalRedirect = ({ to }) => {
  useEffect(() => {
    window.location.href = to;
  }, [to]);
  return <div>Redirecting…</div>;
};

const LoginRedirect = () => <ExternalRedirect to={COGNITO_BASE} />;
const SignupRedirect = () => (
  <ExternalRedirect to={COGNITO_BASE.replace('/login?', '/signup?')} />
);

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
