import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './index.css';
import { registerServiceWorker } from './core/pwa/register-sw';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
