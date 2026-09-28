/* eslint-disable react-refresh/only-export-components -- app entry owns route-level lazy imports */
import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Invitation from './pages/Invitation';
import NotFound from './pages/NotFound';
import './styles/global.css';

// Guests should not download dashboard, Studio and QR tooling with the invitation.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Studio = lazy(() => import('./pages/Studio'));
const CheckIn = lazy(() => import('./pages/CheckIn'));

const loading = (
  <div className="app-min-screen" role="status" style={{ display: 'grid', placeItems: 'center', background: '#F3EADB', color: '#686F4D', fontFamily: 'system-ui', fontSize: 13 }}>
    Memuat halaman…
  </div>
);

const deferred = (element: React.ReactNode) => <Suspense fallback={loading}>{element}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: <Invitation /> },
  { path: '/studio', element: deferred(<Studio />) },
  { path: '/dashboard', element: deferred(<Dashboard />) },
  { path: '/checkin', element: deferred(<CheckIn />) },
  { path: '*', element: <NotFound /> }
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
);
