import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Invitation from './pages/Invitation';
import Dashboard from './pages/Dashboard';
import Studio from './pages/Studio';
import CheckIn from './pages/CheckIn';

const router = createBrowserRouter([
  { path: '/', element: <Invitation /> },
  { path: '/studio', element: <Studio /> },
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/checkin', element: <CheckIn /> }
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
);
