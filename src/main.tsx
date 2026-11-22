import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import GuestApp from './guest/GuestApp';
import TvApp from './tv/TvApp';
import AdminApp from './admin/AdminApp';

// Três áreas, uma por endereço. Qualquer outro caminho cai na área dos convidados.
const path = window.location.pathname.replace(/\/+$/, '');
const App: ComponentType = path === '/tv' ? TvApp : path === '/admin' ? AdminApp : GuestApp;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
