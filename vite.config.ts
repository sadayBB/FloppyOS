import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: { host: true },
  preview: { host: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FloppyOS',
        short_name: 'FloppyOS',
        description: 'Gestor de estudios universitarios con estética retro',
        lang: 'es',
        theme_color: '#6d8794',
        background_color: '#d9d0c3',
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
