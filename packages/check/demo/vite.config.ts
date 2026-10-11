import { defineConfig } from 'vite';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: './',
  optimizeDeps: { exclude: ['xmllint-wasm'] },
  worker: { format: 'es' },
  build: { outDir: '../.demo-dist', emptyOutDir: true, target: 'es2022' },
});
