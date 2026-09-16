import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  // Only these explicitly public namespaces can ever enter the browser bundle.
  // Any variable outside these namespaces is excluded from the browser bundle.
  envPrefix: ['VITE_DEMO_'],
  plugins: [
    react(),
    legacy({
      // Covers broadly used older iOS/Android browsers while modern browsers
      // keep receiving native modules and do not pay the polyfill cost.
      targets: ['defaults', 'iOS >= 12', 'Android >= 7', 'Samsung >= 8']
    })
  ],
  server: { port: 5173 },
  build: { outDir: 'dist', assetsInlineLimit: 0 }
});
