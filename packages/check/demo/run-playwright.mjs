/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Serves the built demo from a local gzip-enabled server, opens it in headless Chromium with every request that
// is not to that server blocked, and prints the result and the transferred sizes.
// usage: node demo/run-playwright.mjs   (after `npx vite build --config demo/vite.config.ts`)
import http from 'node:http';
import zlib from 'node:zlib';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.demo-dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = existsSync(p) && statSync(p).isFile() ? p : join(root, 'index.html');
  const body = readFileSync(file);
  const gz = zlib.gzipSync(body, { level: 9 });
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'content-encoding': 'gzip', 'content-length': gz.length });
  res.end(gz);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let exit = 0;
try {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext();
  const blocked = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await ctx.newPage();
  const sizes = [];
  ctx.on('requestfinished', async (req) => {
    if (!req.url().startsWith(origin)) return;
    const z = await req.sizes();
    sizes.push({ file: req.url().replace(origin, ''), transferredBytes: z.responseBodySize + z.responseHeadersSize, fromWorker: !req.frame() || req.serviceWorker() !== null });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => window.__result, null, { timeout: 60000 });
  const result = await page.evaluate(() => window.__result);
  await new Promise((r) => setTimeout(r, 300));
  const files = sizes.map(({ file, transferredBytes }) => ({ file, transferredBytes }));
  const total = files.reduce((a, f) => a + f.transferredBytes, 0);
  console.log(JSON.stringify({ blockedRequests: blocked, pageErrors: errors, files, totalTransferredBytes: total, result }, null, 1));
  if (blocked.length || errors.length || !result.valid.valid || result.bad.valid) exit = 1;
  await browser.close();
} catch (e) {
  console.error(e);
  exit = 1;
} finally {
  server.close();
}
process.exit(exit);
