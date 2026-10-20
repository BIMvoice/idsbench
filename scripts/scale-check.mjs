/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A fourth browser script: large models, the model kept between runs, a worker that goes silent or is ended, and
// models too large to open. Headless Chromium against dist/, every request that is not to the local server blocked.
// Generated models go to .scratch/scale-check/ and are deleted at the end (the two "too large" files are sparse: they
// take no disk). Prints a line of numbers for each large run: seconds, longest freeze, peak memory of the browser.
// Usage: node scripts/scale-check.mjs [walls in the large model, default 1400000]      (CHROMIUM_PATH for an installed browser)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const WALLS = Number(process.argv[2] ?? 1_400_000);
const dist = path.resolve('dist');
const out = path.resolve('.scratch/scale-check');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'b'), { recursive: true });

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
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' | ' + String(extra).slice(0, 400) : ''}`); };
const make = (walls, file, mode, name) => execFileSync('node', ['scripts/make-large-model.mjs', String(walls), file, mode, path.join(out, 'waldo.ids'), ...(name ? [name] : [])]);
const rssMB = () => {
  try { return execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /chrome-headless-shell|chromium/i.test(l)).reduce((n, l) => n + Number(l.trim().split(/\s+/)[0]), 0) / 1024; } catch { return 0; }
};
/** Number of lines of a file, and how many start with `prefix`, read as a stream. */
const countLines = async (file, prefix) => {
  let lines = 0, withPrefix = 0;
  for await (const l of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) { lines++; if (l.startsWith(prefix)) withPrefix++; }
  return { lines, withPrefix };
};
const countOf = async (file, needle) => {
  let n = 0, tail = '';
  for await (const chunk of fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 24 })) {
    const t = tail + chunk;
    for (let i = t.indexOf(needle); i !== -1; i = t.indexOf(needle, i + needle.length)) n++;
    tail = t.slice(-needle.length);
  }
  return n;
};

// ---- inputs -----------------------------------------------------------------
make(1000, path.join(out, 'tiny.ifc'), 'pass');
const big = path.join(out, `walls-${WALLS}.ifc`);
make(WALLS, big, 'fail');
const keptA = path.join(out, 'walls.ifc'), keptB = path.join(out, 'b', 'walls.ifc');
make(300_000, keptA, 'pass', 'Waldo');
make(300_000, keptB, 'pass', 'Wilma');
check('the two models of the kept-copy test have the same name and the same size', fs.statSync(keptA).size === fs.statSync(keptB).size && path.basename(keptA) === path.basename(keptB));
const ids = path.join(out, 'waldo.ids');
// A file of 1.1 GB (a hole, no disk), and a real one of 9.4 million walls (about 620 MB): more than a tab holds. The
// entities are counted over the whole file, so a file that only looks dense at its two ends would not do.
const huge = path.join(out, 'huge.ifc');
fs.closeSync(fs.openSync(huge, 'w')); fs.truncateSync(huge, Math.round(1.1 * 1024 ** 3));
const dense = path.join(out, 'dense.ifc');
make(9_400_000, dense, 'pass');
// The time of the first kept model is in whole seconds, so that it can be put back after the file is written over.
fs.utimesSync(keptA, 1_700_000_000, 1_700_000_000);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  const blocked = [], requests = [];
  let stubWorker = false, stubXmllint = false;
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (stubWorker && /\/assets\/worker-/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.onmessage = () => {};' });
    // The Check engine's schema validator runs in a worker of its own: one that never answers, as one ended without a word.
    if (stubXmllint && /\/assets\/xmllint-browser-/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.onmessage = () => {};' });
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) { requests.push(u); return route.continue(); }
    blocked.push(u); return route.abort();
  });
  // The page's workers, so that one can be ended from outside the way the browser ends one: without a word.
  await ctx.addInitScript(() => {
    window.__workers = [];
    const Real = window.Worker;
    window.__beatsWhileReading = 0;
    window.Worker = class extends Real {
      constructor(...a) {
        super(...a);
        window.__workers.push(this);
        // What the worker says while it reads a model: the page must hear from it then too.
        this.addEventListener('message', (ev) => {
          if (ev.data?.type === 'phase') window.__phase = ev.data.phase;
          else if (ev.data?.type === 'done' || ev.data?.type === 'error') window.__phase = null;
          else if (ev.data?.type === 'beat' && window.__phase === 'reading-ifc') window.__beatsWhileReading++;
        });
      }
    };
    window.__longest = 0;
    let last = performance.now();
    setInterval(() => { const n = performance.now(); window.__longest = Math.max(window.__longest, n - last - 50); last = n; }, 50);
    window.__texts = [];
    new MutationObserver(() => { const t = document.querySelector('.title-block .headline')?.textContent; if (t && window.__texts[window.__texts.length - 1] !== t) window.__texts.push(t); }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('crash', () => check('the tab did not crash', false));
  const idsInput = page.locator('input[type=file]').nth(0);
  const ifcInput = page.locator('input[type=file]').nth(1);
  const verdict = page.locator('.title-block[data-kind="run"] .verdict');
  const headline = page.locator('.title-block .headline');
  const fresh = async () => { await page.evaluate(() => sessionStorage.clear()).catch(() => {}); await page.goto(origin + '/'); await idsInput.setInputFiles(ids); await page.locator('.verdict.pass, .verdict.incomplete').first().waitFor({ timeout: 20000 }); };
  const texts = () => page.evaluate(() => window.__texts.splice(0));
  const download = async (button, name) => {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const d = await dl;
    const to = path.join(out, button);
    await d.saveAs(to);
    return to;
  };

  // ---- a large model that all fails ---------------------------------------------
  await fresh();
  let peak = 0;
  const sampler = setInterval(() => { peak = Math.max(peak, rssMB()); }, 250);
  const t0 = Date.now();
  await ifcInput.setInputFiles(big);
  await verdict.waitFor({ timeout: 280000 });
  const seconds = (Date.now() - t0) / 1000;
  clearInterval(sampler);
  const longest = await page.evaluate(() => Math.round(window.__longest));
  console.log(`LARGE: ${WALLS.toLocaleString('en')} walls, ${(fs.statSync(big).size / 1048576).toFixed(0)} MB, all failing: result after ${seconds.toFixed(1)} s; longest freeze of the page ${longest} ms; peak memory of the browser ${peak.toFixed(0)} MB`);
  check(`${WALLS.toLocaleString('en')} walls that all fail: the result is Fail and the page listed 200 rows`, (await page.locator('.verdict-word').innerText()) === 'Fail' && (await page.locator('.fail-group tbody tr').count()) === 200);
  check('the page stayed responsive (no freeze over 500 ms)', longest < 500, `${longest} ms`);
  const beats = await page.evaluate(() => window.__beatsWhileReading);
  check('the worker said that it was alive while it read the model, not only before and after', beats >= 2, `${beats} times`);
  await page.locator('details.fails > summary').first().click();
  check('the page says how many are not listed and that the files hold them all', (await page.locator('.fails .note').first().innerText()).includes(`The first 200 failing elements are listed here. ${(WALLS - 200).toLocaleString('en')} more are not shown on this page. The downloaded files list all ${WALLS.toLocaleString('en')}.`), await page.locator('.fails .note').first().innerText());
  check('the summary has the exact count', (await page.locator('.spec-counts').first().innerText()).includes(`${WALLS.toLocaleString('en')} failed`));
  const csv = await download('failing.csv', 'Download failing elements');
  const rows = await countLines(csv, 'Element,');
  check(`the CSV holds all ${WALLS.toLocaleString('en')} failing elements, each marked "Element", and the header`, rows.lines === WALLS + 1 && rows.withPrefix === WALLS, JSON.stringify(rows));
  const report = await download('report.json', 'Download report');
  const inReport = await countOf(report, '"ifcClass"');
  const head = fs.readFileSync(report, 'utf8').slice(0, 20000);
  check(`the report holds all ${WALLS.toLocaleString('en')} failing elements and says so in the count`, inReport === WALLS && head.includes(`"failureTotal":${WALLS}`), `${inReport}`);
  fs.rmSync(csv); fs.rmSync(report);

  // ---- the model is kept: a run after an edit does not read it again ------------
  await fresh();
  const t1 = Date.now();
  await ifcInput.setInputFiles(keptA);
  await verdict.waitFor({ timeout: 120000 });
  const firstSeconds = (Date.now() - t1) / 1000;
  const firstRecord = await page.locator('.record').innerText();
  await texts();
  const t2 = Date.now();
  await page.getByRole('button', { name: /^Edit / }).first().click();
  await page.locator('.page-specs > .spec').first().getByLabel('Name', { exact: true }).fill('Walls are named Waldo, edited');
  await page.locator('.title-block[data-kind="run"] .record', { hasText: 'unsaved changes' }).waitFor({ timeout: 60000 });
  const secondSeconds = (Date.now() - t2) / 1000;
  const seen = await texts();
  console.log(`KEPT: ${(fs.statSync(keptA).size / 1048576).toFixed(0)} MB model, first run ${firstSeconds.toFixed(1)} s (reads and parses), the run after an edit ${secondSeconds.toFixed(1)} s (checks only)`);
  check('the run after an edit did not read the model again (the page never said it was reading)', !seen.some((t) => /Reading the IFC model/.test(t)), seen.join(' | '));
  check('the result after the edit is the same pass, for the same model', (await page.locator('.verdict-word').innerText()) === 'Pass' && /walls\.ifc/.test(firstRecord));
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  // The same name, size and time, other content, chosen as a new file: read again, and the result is the new content's.
  await texts();
  await ifcInput.setInputFiles(keptB);
  await page.locator('.verdict.fail').first().waitFor({ timeout: 120000 });
  const seenB = await texts();
  check('a changed model file (same name and size, other content) is read again and its own result shown, not the kept copy\'s', (await page.locator('.verdict-word').innerText()) === 'Fail' && (await page.locator('.spec-counts').first().innerText()).includes('300,000 failed'), await page.locator('.spec-counts').first().innerText());
  // The same file chosen again is a new file object: read again.
  await texts();
  await ifcInput.setInputFiles(keptA);
  await page.locator('.verdict.pass').first().waitFor({ timeout: 120000 });
  check('choosing the first file again gives the first file\'s result', (await page.locator('.verdict-word').innerText()) === 'Pass');
  // The file is written over on disk with other content of the same size, and its time is put back. The result on the
  // page is of what was read; the report has to name those bytes, not what the file holds now.
  const shaRead = sha256(keptA), shaNow = sha256(keptB);
  { const fd = fs.openSync(keptA, 'r+'); const other = fs.readFileSync(keptB); fs.writeSync(fd, other, 0, other.length, 0); fs.closeSync(fd); }
  fs.utimesSync(keptA, 1_700_000_000, 1_700_000_000);
  const keptReport = JSON.parse(fs.readFileSync(await download('kept-report.json', 'Download report'), 'utf8'));
  check('the report names the model by the SHA-256 of the bytes that were checked, not of what the file holds when the report is made', keptReport.run.verdict === 'pass' && keptReport.model.sha256 === shaRead && shaRead !== shaNow && keptReport.model.bytes === fs.statSync(keptA).size, `${keptReport.run.verdict} ${keptReport.model.sha256} (read ${shaRead.slice(0, 8)}, now on disk ${shaNow.slice(0, 8)})`);

  // The gain of the kept copy where the model is large and little of it applies: 700,000 entities, three of them walls.
  const filler = path.join(out, 'filler.ifc');
  make(700_000, filler, 'filler');
  await fresh();
  const t3 = Date.now();
  await ifcInput.setInputFiles(filler);
  await verdict.waitFor({ timeout: 120000 });
  const checkedIn = async () => Number(/Checked in\s+([\d.]+) s/.exec(await page.locator('.record').innerText())?.[1]);
  const readSeconds = await checkedIn();
  void t3;
  const t4 = Date.now();
  await page.getByRole('button', { name: /^Edit / }).first().click();
  await page.locator('.page-specs > .spec').first().getByLabel('Name', { exact: true }).fill('Edited once');
  await page.locator('.title-block[data-kind="run"] .record', { hasText: 'unsaved changes' }).waitFor({ timeout: 60000 });
  const againSeconds = await checkedIn();
  void t4;
  console.log(`KEPT: ${(fs.statSync(filler).size / 1048576).toFixed(0)} MB model of 700,000 entities (3 walls): "Checked in" ${readSeconds.toFixed(2)} s for the first run (reads, parses, checks), ${againSeconds.toFixed(2)} s for the run after an edit (checks only)`);
  check('with a large model of which little applies, the run after an edit is much faster than the first', againSeconds < readSeconds / 2, `${readSeconds} s then ${againSeconds} s`);
  fs.rmSync(filler);

  // ---- a worker that goes silent -----------------------------------------------------
  stubWorker = true;
  await fresh();
  await ifcInput.setInputFiles(path.join(out, 'tiny.ifc'));
  await page.locator('#stalled').waitFor({ timeout: 45000 });
  const stalledText = await page.locator('#stalled').innerText();
  check('a worker that stops answering: after 30 seconds the page says so and offers "Stop and try again"', /has not answered for 30 seconds/.test(stalledText) && (await page.getByRole('button', { name: 'Stop and try again' }).count()) === 1, stalledText);
  stubWorker = false;
  await page.getByRole('button', { name: 'Stop and try again' }).click();
  await verdict.waitFor({ timeout: 30000 });
  check('"Stop and try again" ends the stuck worker and the run gives its result', (await page.locator('.verdict-word').innerText()) === 'Pass' && (await page.locator('#stalled').count()) === 0);

  // ---- the Check engine's worker never answers ---------------------------------------
  stubXmllint = true;
  await page.evaluate(() => sessionStorage.clear()).catch(() => {});
  await page.goto(origin + '/');
  await idsInput.setInputFiles(ids);
  await page.locator('.title-block .model-refusal .error').waitFor({ timeout: 45000 });
  const checkStalled = await page.locator('.title-block .model-refusal .error').innerText();
  check('a check of the IDS file whose worker never answers: after 30 seconds the page says so and offers "Check again", and no longer says "Checking"', /^The check of the IDS file did not answer, so there is no verdict\./.test(checkStalled) && (await page.getByRole('button', { name: 'Check again' }).count()) === 1 && (await page.locator('.verdict-word', { hasText: 'Checking' }).count()) === 0, checkStalled);
  stubXmllint = false;
  await page.getByRole('button', { name: 'Check again' }).click();
  await page.locator('.verdict.pass, .verdict.incomplete').first().waitFor({ timeout: 20000 });
  check('"Check again" checks the file once more and gives its verdict', (await page.locator('.verdict-word').innerText()) === 'Valid' && (await page.getByRole('button', { name: 'Check again' }).count()) === 0);

  // ---- a worker ended by the browser without a word ----------------------------------
  await fresh();
  await ifcInput.setInputFiles(big);
  await page.locator('.verdict-word', { hasText: 'Checking' }).waitFor({ timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => window.__workers[window.__workers.length - 1].terminate());
  await page.locator('.model-refusal .error').waitFor({ timeout: 10000 });
  const ended = await page.locator('.model-refusal .error').innerText();
  check('a worker that is ended with no word: the page says so in one sentence, at once', /ended by the browser before it finished, most likely because the model needs more memory/.test(ended) && (await page.getByRole('button', { name: 'Run again' }).count()) === 1, ended);

  // ---- a model that cannot be read any more ------------------------------------------------
  const moved = path.join(out, 'moved.ifc');
  fs.copyFileSync(path.join(out, 'tiny.ifc'), moved);
  await page.evaluate(() => sessionStorage.clear()).catch(() => {});
  await page.goto(origin + '/');
  await ifcInput.setInputFiles(moved);
  fs.appendFileSync(moved, '\n');
  await idsInput.setInputFiles(ids);
  await page.locator('.model-refusal .error').waitFor({ timeout: 20000 });
  const unreadable = await page.locator('.model-refusal .error').innerText();
  check('a model that was saved again after it was chosen: the page says that it could not be read and to choose it again, not that something went wrong', /The model could not be read from your computer\. It was moved, renamed, deleted or saved again after it was chosen here, so no result was made\. Choose it again\./.test(unreadable) && (await page.locator('.title-block[data-kind="run"]').count()) === 0, unreadable);

  // ---- models too large to open --------------------------------------------------------
  await fresh();
  const before = await rssMB();
  await ifcInput.setInputFiles(huge);
  await page.locator('.model-refusal .error').waitFor({ timeout: 10000 });
  const tooBig = await page.locator('.model-refusal .error').innerText();
  check('a model of 1.1 GB is refused by its size before it is read, with what to do', /This model is 1\.10 GB\. A browser tab cannot hold a model of that size, so it was not opened and no result was made\. Split the model/.test(tooBig) && (await rssMB()) - before < 500, tooBig);
  await ifcInput.setInputFiles(dense);
  await page.waitForFunction(() => /This model has [\d,]+ entities/.test(document.querySelector('.model-refusal .error')?.textContent ?? ''), null, { timeout: 120000 });
  const tooMany = await page.locator('.model-refusal .error').innerText();
  check('a model of 9.4 million walls is refused before it is parsed, with its exact count, what the browser reports for the computer and what a tab was measured to hold', /^This model has 9,400,000 entities\. This browser reports 8 GB of memory or more for this computer, and a browser tab was measured to hold about 9\.3 million entities that have a name or an identifier of their own\. So the model was not read and no result was made\. Split the model/.test(tooMany), tooMany);
  check('neither refusal offers "Run again" (the same file would be refused again)', (await page.getByRole('button', { name: 'Run again' }).count()) === 0);
  await ifcInput.setInputFiles(path.join(out, 'tiny.ifc'));
  await verdict.waitFor({ timeout: 20000 });
  check('after a refusal the page still checks the next model', (await page.locator('.verdict-word').innerText()) === 'Pass');

  // ---- the whole script ------------------------------------------------------------------
  check('no request to anything but the local server', blocked.length === 0, blocked.join(', '));
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), idb: indexedDB.databases ? undefined : undefined }));
  check('storage holds nothing but the draft (nothing in localStorage; in sessionStorage only the draft key, if any)', storage.local.length === 0 && storage.session.every((k) => /draft/i.test(k)), JSON.stringify(storage));
  check('no error on the page', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(out, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
