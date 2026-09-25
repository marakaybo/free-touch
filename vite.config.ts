import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Редактор внутри программы на ПК.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5190, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2021', chunkSizeWarningLimit: 3000 },
});
