import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { db } from './db';
import './styles.css';
import './styles-modules.css';
import './styles-security.css';

registerSW({ immediate: true });
// Ask the browser not to evict our IndexedDB under storage pressure.
void navigator.storage?.persist?.();
void db.open();

// Refuse to run inside a frame on another site (clickjacking).
if (window.top !== window.self) {
  document.body.textContent = 'FloppyOS no puede abrirse dentro de otra página.';
  throw new Error('framed');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
