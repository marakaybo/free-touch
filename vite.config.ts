import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// Редактор внутри программы на ПК.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: { port: 5190, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2021', chunkSizeWarningLimit: 3000 },
});
