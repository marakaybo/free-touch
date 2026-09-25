import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Веб-пульт для телефона. Собирается в dist-panel и вшивается в программу на ПК.
export default defineConfig({
  root: 'panel',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist-panel', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 2000 },
  server: {
    port: 5191,
    host: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:7474', ws: true }, '/api': 'http://127.0.0.1:7474' },
  },
});
