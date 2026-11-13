import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Entwicklung: `npm run dev:web` mit laufendem Server auf Port 8766 (Token in der URL ?t=…).
export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: { outDir: '../web-dist', emptyOutDir: true },
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:8766' } },
});
