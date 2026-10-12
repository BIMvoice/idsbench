/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Times one model through the real page in headless Chromium and reports time to the result, the longest freeze of the
// page, and the peak memory of the browser (all its processes, from ps). Files go to .scratch/ and are the caller's.
// Usage: node scripts/measure-browser.mjs <model.ifc> <spec.ids> [timeout seconds]   (CHROMIUM_PATH for an installed browser)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const [model, idsFile, timeoutS = '280'] = process.argv.slice(2);
const dist = path.resolve(process.env.DIST ?? 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const rssMB = () => {
  try {
    // Every process of the headless browser (the page, its workers, the GPU and network helpers); the run is the only one at a time.
    const rows = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /chrome-headless-shell|chromium/i.test(l));
    return rows.reduce((n, l) => n + Number(l.trim().split(/\s+/)[0]), 0) / 1024;
  } catch { return 0; }
};
let peak = 0;
const sampler = setInterval(() => { peak = Math.max(peak, rssMB()); }, 250);
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
let crashed = false;
page.on('crash', () => { crashed = true; });
const logged = [];
page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text().slice(0, 300)); });
await page.goto(origin + '/');
await page.evaluate(() => {
  window.__max = 0;
  let last = performance.now();
  setInterval(() => { const n = performance.now(); window.__max = Math.max(window.__max, n - last - 50); last = n; }, 50);
});
const t0 = Date.now();
await page.locator('input[type=file]').nth(0).setInputFiles(idsFile);
await page.locator('.verdict.pass, .verdict.incomplete').first().waitFor({ timeout: 30000 });
const t1 = Date.now();
await page.locator('input[type=file]').nth(1).setInputFiles(model);
let outcome = 'timeout';
const deadline = Date.now() + Number(timeoutS) * 1000;
while (Date.now() < deadline) {
  if (crashed) { outcome = 'TAB CRASHED'; break; }
  const state = await page.evaluate(() => {
    const r = document.querySelector('.title-block[data-kind="run"]');
    if (r) return 'result: ' + (r.querySelector('.verdict-word')?.textContent ?? '') + ' | ' + (r.querySelector('.headline')?.textContent ?? '');
    const e = document.querySelector('.model-refusal .error');
    if (e) return 'error: ' + e.textContent;
    return null;
  }).catch(() => null);
  if (state) { outcome = state; break; }
  await new Promise((r) => setTimeout(r, 200));
}
const secs = ((Date.now() - t1) / 1000).toFixed(1);
const freeze = await page.evaluate(() => Math.round(window.__max)).catch(() => -1);
peak = Math.max(peak, rssMB());
let extra = '';
if (!crashed && outcome.startsWith('result')) {
  const t2 = Date.now();
  extra = ` | rows on page: ${await page.locator('.fail-group tbody tr').count()}`;
  void t2;
}
console.log(JSON.stringify({ model: path.basename(model), mb: Math.round(fs.statSync(model).size / 1048576), seconds: Number(secs), longestFreezeMs: freeze, peakBrowserMB: Math.round(peak), outcome: outcome.slice(0, 200) + extra, consoleErrors: logged.slice(0, 3) }));
clearInterval(sampler);
await browser.close().catch(() => {});
server.close();
process.exit(0);
