/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Comparing the model with an earlier delivery, in the built page (run `npm run build` first): the example IDS file, two
// variants of the example model, the comparison chosen and downloaded from the keyboard, the report naming both models,
// and the page as it was once the earlier delivery is removed. Headless Chromium with every non-local request blocked.
// Usage: node scripts/compare-check.mjs [screenshot dir]        (set CHROMIUM_PATH to use an already installed browser)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
const dist = path.resolve('dist');
const out = path.resolve('.scratch/compare-check');
fs.mkdirSync(out, { recursive: true });
if (shots) fs.mkdirSync(shots, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

let passed = 0, failed = 0;
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`); };

// The example that ships with the page, and the same variants the unit test builds (tests/compare.test.ts).
const example = fs.readFileSync('src/core/example.ts', 'utf8');
const IDS = example.match(/EXAMPLE_IDS = `([\s\S]*?)`;/)[1];
const V1 = example.match(/EXAMPLE_IFC = `([\s\S]*?)`;/)[1];
const V2 = V1
  .replace("#2=IFCWALL('0aExampleWall000000002',$,'Wall east',", "#2=IFCWALL('0aExampleWall000000002',$,$,")
  .replace("#4=IFCWALL('0aExampleWall000000004',$,'Wall west',$,$,$,$,$,$);\n", "#5=IFCWALL('0aExampleWall000000005',$,'Wall new',$,$,$,$,$,$);\n#6=IFCDOOR('0aExampleDoor000000001',$,'Door 1',$,$,$,$,$,$,$,$,$,$);\n")
  .replace('(#1,#2),#11);', '(#1,#2,#3),#11);');
const files = { ids: path.join(out, 'requirements.ids'), v1: path.join(out, 'building-v1.ifc'), v2: path.join(out, 'building-v2.ifc') };
fs.writeFileSync(files.ids, IDS);
fs.writeFileSync(files.v1, V1);
fs.writeFileSync(files.v2, V2);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const blocked = [];
try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  // Every run the page asks of the worker, with which model slot and whether it collects (the page's own code is not changed for this).
  await ctx.addInitScript(() => {
    window.__runs = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (m, ...rest) { if (m && m.type === 'run') window.__runs.push(`${m.slot ?? 'model'}${m.collect ? '+collect' : ''}`); return post.call(this, m, ...rest); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin + '/');
  const word = () => page.locator('.verdict-word').first().innerText();
  const states = () => page.locator('ol.page-specs:not(.compare-specs) .spec-head .state').allInnerTexts();

  // ---- one model: the page as it always was ----
  await page.setInputFiles('input[aria-label="Choose an IDS file to open"]', files.ids);
  await page.setInputFiles('input[aria-label="Choose an IFC model"]', files.v2);
  await page.waitForFunction(() => document.querySelector('.title-block')?.getAttribute('data-kind') === 'run');
  const single = { word: await word(), states: (await states()).join(','), headline: await page.locator('.title-block .headline').innerText() };
  check('one model: the run is shown as before, and there is no comparison', single.word === 'Fail' && single.states === 'Fail,Fail,Fail' && (await page.locator('#compare').count()) === 0, `${single.word} ${single.states}`);
  check('one model: the offer to compare is in the IFC box', (await page.getByRole('button', { name: 'Compare with an earlier delivery' }).count()) === 1);

  // ---- the earlier delivery, chosen from the keyboard ----
  // Watch the verdict and its record while the earlier delivery is chosen and removed: they must never go.
  await page.evaluate(() => {
    window.__verdicts = new Set();
    const note = () => window.__verdicts.add(`${document.querySelector('.title-block')?.getAttribute('data-kind')}|${document.querySelector('.verdict-word')?.textContent}`);
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    window.__runs.length = 0;
  });
  const offer = page.getByRole('button', { name: 'Compare with an earlier delivery' });
  await offer.focus();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
  await chooser.setFiles(files.v1);
  await page.locator('#compare-headline').waitFor();
  const headline = await page.locator('#compare-headline').innerText();
  const chosenRuns = await page.evaluate(() => window.__runs.join(','));
  check('choosing the earlier delivery leaves the run of the model alone: one pass of the model that collects, then the earlier delivery', chosenRuns === 'model+collect,earlier+collect', chosenRuns);
  check('the headline counts the changes', headline === 'building-v2.ifc against building-v1.ifc: 2 specifications now fail and 1 still fails.', headline);
  const elementLine = await page.locator('#compare-elements').innerText();
  check('the element line counts the element changes', elementLine === 'Failing elements: 1 fixed, 1 removed from the model and 3 new failures (2 of them new elements).', elementLine);
  const changes = await page.locator('.compare-specs .state').allInnerTexts();
  check('each specification has its change', changes.join(',') === 'Still fails,Now fails,Now fails', changes.join(','));
  const filesTable = await page.locator('.compare-files').innerText();
  check('both models are named, with their size and SHA-256', /building-v1\.ifc/.test(filesTable) && /building-v2\.ifc/.test(filesTable) && (filesTable.match(/\b[0-9a-f]{64}\b/g) ?? []).length === 2, filesTable.replace(/\s+/g, ' '));
  check('the verdict of the model is unchanged by the comparison', (await word()) === single.word && (await states()).join(',') === single.states && (await page.locator('.title-block .headline').innerText()) === single.headline);
  if (shots) await page.locator('#compare').screenshot({ path: path.join(shots, 'compare-summary.png') });

  // The element changes open from the keyboard.
  const first = page.locator('.compare-specs details summary').first();
  await first.focus();
  await page.keyboard.press('Enter');
  const opened = await page.locator('.compare-specs details').first().evaluate((d) => d.open);
  const groups = await page.locator('.compare-specs details').first().locator('.change-group h5').allInnerTexts();
  check('the element changes open from the keyboard, grouped by change', opened && groups.join(' | ') === 'Fixed: 1 element | Element removed: 1 element | New element, failing: 1 element', groups.join(' | '));
  if (shots) {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.locator('#compare').screenshot({ path: path.join(shots, 'compare-elements.png') });
  }

  // ---- the downloads ----
  const dl = page.getByRole('button', { name: 'Download the comparison' });
  await dl.focus();
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  const csvPath = path.join(out, csvDownload.suggestedFilename());
  await csvDownload.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  check('the comparison downloads as CSV with a byte order mark, one row per specification and per changed element', csvDownload.suggestedFilename() === 'building-v2-compared-with-building-v1.csv' && csv.startsWith('﻿') && rows.length === 1 + 3 + 5, `${csvDownload.suggestedFilename()}, ${rows.length} lines`);
  const [reportDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  const reportPath = path.join(out, reportDownload.suggestedFilename());
  await reportDownload.saveAs(reportPath);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  check('the report names both models by name, size and SHA-256, and holds the comparison',
    report.model?.name === 'building-v2.ifc' && report.model.bytes === Buffer.byteLength(V2) && /^[0-9a-f]{64}$/.test(report.model.sha256 ?? '')
    && report.earlierModel?.name === 'building-v1.ifc' && report.earlierModel.bytes === Buffer.byteLength(V1) && /^[0-9a-f]{64}$/.test(report.earlierModel.sha256 ?? '')
    && report.comparison?.headline === headline && report.run?.keys === undefined,
    JSON.stringify({ model: report.model, earlierModel: report.earlierModel }));

  // ---- an edit: the comparison follows the document ----
  // Removing the earlier delivery leaves the page as it was with one model.
  const remove = page.getByRole('button', { name: 'Remove the earlier delivery' });
  await remove.focus();
  await page.evaluate(() => { window.__runs.length = 0; });
  await page.keyboard.press('Enter');
  await page.locator('#compare').waitFor({ state: 'detached' });
  await page.waitForTimeout(800);
  const removedRuns = await page.evaluate(() => window.__runs.join(','));
  check('removing the earlier delivery runs nothing again', removedRuns === '', removedRuns);
  const verdicts = await page.evaluate(() => [...window.__verdicts].join(' ; '));
  check('the verdict of the model never left the page while the earlier delivery was chosen and removed', verdicts === 'run|Fail', verdicts);
  check('removing the earlier delivery leaves the page as it was with one model', (await word()) === single.word && (await states()).join(',') === single.states && (await page.getByRole('button', { name: 'Compare with an earlier delivery' }).count()) === 1);
  const [plainReport] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  const plainPath = path.join(out, `plain-${plainReport.suggestedFilename()}`);
  await plainReport.saveAs(plainPath);
  const plain = JSON.parse(fs.readFileSync(plainPath, 'utf8'));
  check('and its report has no earlier model and no comparison', !('earlierModel' in plain) && !('comparison' in plain) && plain.model?.name === 'building-v2.ifc');

  // An IDS file chosen as the earlier delivery is not taken.
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Compare with an earlier delivery' }).click()]);
  await chooser2.setFiles(files.ids);
  await page.locator('#earlier-refusal').waitFor();
  check('an IDS file chosen as the earlier delivery is said and not taken', /is an IDS file, not an IFC model/.test(await page.locator('#earlier-refusal').innerText()) && (await page.locator('#compare').count()) === 0);

  check('no error on the page', errors.length === 0, errors.join(' | '));
  check('no request to anything but the local server', blocked.length === 0, blocked.join(', '));
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failed} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(failed ? 1 : 0);
