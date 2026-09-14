import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
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
