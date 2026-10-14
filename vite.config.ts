import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Content Security Policy for the published build: scripts only from this origin, and network
 * access only to the services the app actually uses (Supabase, Claude, Open Library, Crossref).
 * Not applied in dev, where Vite's HMR needs inline scripts and websockets.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://openlibrary.org https://api.crossref.org",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const securityHeaders = (): Plugin => ({
  name: 'floppyos-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`,
    ),
});

export default defineConfig({
  base: './',
  server: { host: true },
  preview: { host: true },
  plugins: [
    react(),
    securityHeaders(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'push-sw.js'],
      manifest: {
        name: 'FloppyOS',
        short_name: 'FloppyOS',
        description: 'Gestión académica: materias, tareas, agenda, calificaciones y estudio.',
        lang: 'es',
        theme_color: '#7a5fd0',
        background_color: '#a98ae6',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,woff,woff2,png,svg}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
