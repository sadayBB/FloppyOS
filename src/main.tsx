import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { db } from './db';
import './styles.css';

registerSW({ immediate: true });
// Ask the browser not to evict our IndexedDB under storage pressure.
void navigator.storage?.persist?.();
void db.open();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
