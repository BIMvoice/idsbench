// Serves dist/ from a tiny static server, drives it with headless Chromium,
// blocks every request that is not to the local server.
// Usage: node scripts/browser-check.mjs <TestCases/ids dir> [big.ifc big.ids]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const cases = process.argv[2];
const big = process.argv[3];
const dist = path.resolve('dist');
const out = path.resolve('.scratch');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4173, '127.0.0.1', r));
const origin = 'http://127.0.0.1:4173';

let passed = 0, failed = 0;
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  const blocked = [], local = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) { local.push(u); return route.continue(); }
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const load = async (idsFile, ifcFile) => {
    await page.goto(origin + '/');
    await page.getByRole('tab', { name: 'Run' }).click();
    await page.locator('input[type=file]').nth(0).setInputFiles(idsFile);
    await page.locator('input[type=file]').nth(1).setInputFiles(ifcFile);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
  };

  // tabs
  await page.goto(origin + '/');
  check('three tabs present', (await page.getByRole('tab').allTextContents()).join(',') === 'Write,Check,Run');
  await page.getByRole('tab', { name: 'Write' }).click();
  check('Write says not built yet', await page.getByText('Not built yet').first().isVisible());
  await page.getByRole('tab', { name: 'Check' }).click();
  check('Check says not built yet', await page.getByText('Not built yet').nth(1).isVisible() || (await page.locator('#panel-check').innerText()).includes('Not built yet'));
  await page.getByRole('tab', { name: 'Run' }).click();
  check('Run disabled with no files', await page.getByRole('button', { name: 'Run', exact: true }).isDisabled());

  // pass pair
  const pass = 'pass-a_minimal_ids_can_check_a_minimal_ifc_2_2';
  await load(path.join(cases, pass + '.ids'), path.join(cases, pass + '.ifc'));
  await page.locator('.headline').waitFor({ timeout: 60000 });
  const h1 = await page.locator('.headline').innerText();
  check('pass pair headline', /passed/.test(h1) && /^(All|The one|1 of 1)/.test(h1), h1);
  check('pass pair row state Pass', (await page.locator('.spec .state').first().innerText()).includes('Pass'));
  check('file names/sizes shown', (await page.locator('.drop-detail').first().innerText()).includes(pass + '.ids'));
  await page.screenshot({ path: path.join(out, 'shot-pass.png'), fullPage: true });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const d = await dl;
  const rp = path.join(out, 'report-download.json');
  await d.saveAs(rp);
  const rj = JSON.parse(fs.readFileSync(rp, 'utf8'));
  check('report download is JSON with specs', Array.isArray(rj.specs) && rj.specs.length >= 1, d.suggestedFilename());

  // fail pair
  const fail = 'fail-a_minimal_ids_can_check_a_minimal_ifc_1_2';
  await load(path.join(cases, fail + '.ids'), path.join(cases, fail + '.ifc'));
  await page.locator('.headline').waitFor({ timeout: 60000 });
  const h2 = await page.locator('.headline').innerText();
  check('fail pair headline', /^0 of 1 specification passed/.test(h2), h2);
  const st = await page.locator('.spec .state').first().innerText();
  check('fail pair row state Fail', st.includes('Fail'), st.trim());
  await page.locator('summary.spec-head').first().click();
  const rows = await page.locator('.spec tbody tr').count();
  check('failing element listed', rows >= 1, `${rows} row(s): ${await page.locator('.spec tbody tr').first().innerText()}`);
  await page.screenshot({ path: path.join(out, 'shot-fail.png'), fullPage: true });

  // error: not XML
  fs.writeFileSync(path.join(out, 'bad.ids'), 'this is not xml');
  await load(path.join(out, 'bad.ids'), path.join(cases, fail + '.ifc'));
  await page.locator('.error').waitFor({ timeout: 30000 });
  const e1 = await page.locator('.error').innerText();
  check('bad IDS gives plain message', /not valid XML/.test(e1) && !/at .*\.js/.test(e1), e1);

  // error: schema mismatch
  const mm = 'pass-optional_specifications_may_still_pass_if_nothing_is_applicable';
  await load(path.join(cases, mm + '.ids'), path.join(cases, mm + '.ifc'));
  await page.locator('.error').waitFor({ timeout: 30000 });
  check('schema mismatch message', /targets IFC2X3, but the model is IFC4/.test(await page.locator('.error').innerText()));

  // error: not an IFC
  await load(path.join(cases, fail + '.ids'), path.join(out, 'bad.ids'));
  await page.locator('.error').waitFor({ timeout: 30000 });
  check('bad IFC message', /could not be read/.test(await page.locator('.error').innerText()));

  check('no external request attempted', blocked.length === 0, `blocked=${JSON.stringify(blocked)} local=${local.length}`);
  check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  if (big) {
    const ids = process.argv[4];
    await load(ids, big);
    const t0 = Date.now();
    await page.locator('.headline, .error').first().waitFor({ timeout: 590000 });
    console.log(`BIG ${path.basename(big)} ${fs.statSync(big).size} bytes: ${(Date.now() - t0) / 1000}s from Run click to result; ${(await page.locator('.headline, .error').first().innerText())}`);
    console.log('BIG meta:', await page.locator('.meta').innerText().catch(() => '-'));
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`assertions passed: ${passed}, failed: ${failed}`);
process.exit(failed ? 1 : 0);
