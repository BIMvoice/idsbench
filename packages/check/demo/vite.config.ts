/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { defineConfig } from 'vite';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: './',
  optimizeDeps: { exclude: ['xmllint-wasm'] },
  worker: { format: 'es' },
  build: { outDir: '../.demo-dist', emptyOutDir: true, target: 'es2022' },
});
