// The walk-through's third job, replayed on the page from an empty one: four requirements (every wall has a fire
// rating; every door is classified in Uniclass 2015; every space has a name and a number; no building element proxies),
// made with the starting shapes and their defaults, then the downloaded file run against three models. Counts the
// actions a person makes (one click, one text typed into a field, one key pressed to choose).
// Usage: node scripts/replay-job3.mjs <dir with small-with-proxy.ifc and ifc2x3-standardcase-walls.ifc>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [dir = 'tests/fixtures'] = process.argv.slice(2);
const dist = path.resolve('dist');
const out = path.resolve('.scratch/replay');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const withProxy = path.join(dir, 'small-with-proxy.ifc');
const standardCase = path.join(dir, 'ifc2x3-standardcase-walls.ifc');
// (iii) a model with no doors at all
const noDoors = path.join(out, 'no-doors.ifc');
fs.writeFileSync(noDoors, fs.readFileSync(withProxy, 'utf8').split('\n').filter((l) => !/IFCDOOR|#(19|2[0-5])=/.test(l)).join('\n'));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let actions = 0;
const blocked = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue(); blocked.push(u); return route.abort(); });
  const page = await ctx.newPage();
  const click = async (loc) => { actions++; await loc.click(); };
  const pickAfterTyping = async (scope, label, typed) => { actions += 2; const box = scope.getByRole('combobox', { name: label, exact: true }); await box.fill(typed); await scope.locator('[role=option]').first().waitFor(); await box.press('Enter'); };
  const spec = (n) => page.locator('.page-specs > li.spec').nth(n);
  const add = async (how) => {
    const n = await page.locator('.page-specs > li.spec').count();
    await click(page.getByRole('button', { name: 'Add a specification' }));
    await click(page.getByRole('group', { name: 'Start a specification from' }).getByRole('button', { name: how }));
    await page.waitForFunction((k) => document.querySelectorAll('.page-specs > li.spec').length > k, n);
  };
  await page.goto(origin + '/');
  await click(page.getByRole('button', { name: 'New' }));
  actions++; await page.getByLabel('Title').fill('Our requirements');
  await add('Elements must have a property');            // every wall has a fire rating: nothing more to do
  const names = [];
  names.push(await spec(0).getByLabel('Name', { exact: true }).inputValue());
  await add('Elements must have a classification');       // every door is classified in Uniclass 2015: nothing more to do
  names.push(await spec(1).getByLabel('Name', { exact: true }).inputValue());
  await add('Elements must have a name');                  // every space has a name ...
  const s3 = spec(2);
  await click(s3.getByRole('region', { name: 'Must have' }).getByRole('button', { name: 'Add an item to Must have' }));
  await click(s3.getByRole('region', { name: 'Must have' }).getByRole('button', { name: 'Property', exact: true }));
  const prop = s3.getByRole('region', { name: 'Must have' }).locator('li.facet').nth(1);
  await pickAfterTyping(prop, 'Property set', 'space common');
  await pickAfterTyping(prop, 'Property', 'type mark');    // ... and the reference of its type: found by what it means, not by its name Reference (the room number is the Name)
  names.push(await s3.getByLabel('Name', { exact: true }).inputValue());
  await add('Elements must not exist in the model');       // no building element proxies
  names.push(await spec(3).getByLabel('Name', { exact: true }).inputValue());
  await page.locator('.verdict.pass .verdict-word', { hasText: 'Valid' }).waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), click(page.getByRole('button', { name: 'Download .ids' }))]);
  const file = path.join(out, 'our-requirements.ids');
  await dl.saveAs(file);
  console.log(`ACTIONS from an empty page to the downloaded file: ${actions}`);
  console.log(`NAMES generated: ${names.join(' | ')}`);
  console.log(`FILE versions: ${(fs.readFileSync(file, 'utf8').match(/ifcVersion="[^"]*"/g) ?? []).join(' ')}; applicability occurs: ${[...new Set(fs.readFileSync(file, 'utf8').match(/<applicability[^>]*>/g))].join(' ')}`);

  for (const [label, model] of [['(i) small-with-proxy.ifc', withProxy], ['(ii) ifc2x3-standardcase-walls.ifc', standardCase], ['(iii) a model with no doors', noDoors]]) {
    const p = await ctx.newPage();
    await p.goto(origin + '/');
    await p.locator('input[type=file]').first().setInputFiles(file);
    await p.locator('input[type=file]').nth(1).setInputFiles(model);
    await p.locator('.title-block[data-kind="run"] .headline').waitFor({ timeout: 60000 });
    const rows = await p.locator('.page-specs > li.spec').evaluateAll((els) => els.map((e) => `${e.querySelector('.spec-name').textContent}: ${e.querySelector('.state').textContent.trim()} (${e.querySelector('.spec-counts')?.textContent ?? ''})${e.querySelector('.coverage-note') ? ' [' + e.querySelector('.coverage-note').textContent.slice(0, 120) + ']' : ''}`));
    console.log(`RESULT ${label}: ${await p.locator('.verdict-word').innerText()} | ${await p.locator('.headline').innerText()}`);
    for (const r of rows) console.log(`    ${r}`);
    await p.close();
  }
  console.log(`non-local requests: ${blocked.length}`);
} finally {
  await browser.close();
  server.close();
}
