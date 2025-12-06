import React from 'react';
import { useState, useEffect } from 'react';
import WorkerPage from './pages/Worker';
import ManagerPage from './pages/Manager';
import AdminPage from './pages/Admin';
import AcceptInvite from './pages/AcceptInvite';

export default function App(){
  const [route, setRoute] = useState(window.location.pathname + window.location.search);
  useEffect(()=>{ const handler = ()=>setRoute(window.location.pathname+window.location.search); window.addEventListener('popstate', handler); return ()=>window.removeEventListener('popstate', handler); }, []);
  if (route.startsWith('/accept-invite')) return <AcceptInvite />;
  if (route.startsWith('/manager')) return <ManagerPage />;
  if (route.startsWith('/admin')) return <AdminPage />;
  return <WorkerPage />;
}
