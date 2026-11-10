/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Registers the service worker only for the installable web app (http/https), never inside the
 * Electron shell (file:// or window.pittig present). With registerType 'autoUpdate' a new version
 * takes control immediately; the page reloads the next time it is hidden, so nobody loses a form.
 */
function pwaRegister(): Plugin {
  const script = `
(function () {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol) || window.pittig) return;
  window.addEventListener('load', function () {
    var hadController = !!navigator.serviceWorker.controller;
    var pendingReload = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      pendingReload = true;
    });
    document.addEventListener('visibilitychange', function () {
      if (pendingReload && document.visibilityState === 'hidden') location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
    }).catch(function () {});
  });
})();`;
  return {
    name: 'pittig-pwa-register',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './apple-touch-icon.png' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'alternate icon', href: './favicon.ico', sizes: '48x48' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Pittig' }, injectTo: 'head' },
        { tag: 'script', children: script, injectTo: 'body' },
      ];
    },
  };
}

export default defineConfig({
  // Relative base so the build also works from file:// inside Electron and from a GitHub Pages sub-path.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // see pwaRegister(): skipped under Electron / file://
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pittig Finances',
        short_name: 'Pittig',
        description: 'Simple finances for your small business',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
    pwaRegister(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts'],
    css: false,
  },
});
