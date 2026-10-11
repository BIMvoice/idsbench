import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // xmllint-wasm starts its own module Worker from a URL inside the package; it must not be pre-bundled.
  optimizeDeps: { exclude: ['xmllint-wasm'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
