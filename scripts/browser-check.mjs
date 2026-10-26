/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Serves dist/ from a tiny static server on a free local port, drives the one page with
// headless Chromium, and blocks every request that is not to that server.
// scripts/ASSERTIONS.md lists every assertion and what became of those of the tabbed app.
// Usage: node scripts/browser-check.mjs <TestCases dir> [walls]
//   <TestCases dir>  Documentation/ImplementersDocumentation/TestCases of buildingSMART/IDS
//   [walls]          size of the generated model for the scale check (default 20000)
// Files it generates and downloads go to .scratch/browser-check/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { strFromU8, unzipSync } from 'fflate';

const root = process.argv[2];
if (!root) throw new Error('usage: browser-check.mjs <TestCases dir> [walls]');
const cases = path.join(root, 'ids');
const WALLS = Number(process.argv[3] ?? 20000);
const dist = path.resolve('dist');
const out = path.resolve('.scratch/browser-check');
fs.mkdirSync(out, { recursive: true });

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

// ---- generated inputs -------------------------------------------------------
const NS = 'http://standards.buildingsmart.org/IDS';
const write = (name, content) => { const p = path.join(out, name); fs.writeFileSync(p, content); return p; };
const wall = (i, name = 'Waldo') => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'${name}',$,$,$,$,$,$);\n`;
const ifcText = (schema, body) =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
const entity = (cls) => `<entity><name><simpleValue>${cls}</simpleValue></name></entity>`;
const nameIs = (v) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements>`;
// A specification the Check engine accepts but the library will not run (a pattern that could take too long).
const patternIs = (p) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="${p}"/></xs:restriction></value></attribute></requirements>`;
const spec = (name, applicability, req = '', version = 'IFC4') => `<specification name="${name}" ifcVersion="${version}">${applicability}${req}</specification>`;
const app = (min, max, cls) => `<applicability minOccurs="${min}" maxOccurs="${max}">${entity(cls)}</applicability>`;
const SCHEMA_LOCATION = `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd"`;
const idsText = (specs, rootAttrs = `xmlns="${NS}" ${SCHEMA_LOCATION}`) => `<?xml version="1.0" encoding="utf-8"?>\n<ids ${rootAttrs} xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;

const twoWalls = ifcText('IFC4', wall(1) + wall(2));
const goodIfc = write('two-walls.ifc', twoWalls);
const goodIds = write('walls-named-waldo.ids', idsText(spec('Walls are named Waldo', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo'))));
const otherIds = write('walls-named-wilma.ids', idsText(spec('Walls are named Wilma', app(1, 'unbounded', 'IFCWALL'), nameIs('Wilma'))));
const statesIds = write('states.ids', idsText(
  spec('Required, met', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo')) +
  spec('Required, broken', app(1, 'unbounded', 'IFCWALL'), nameIs('Wilma')) +
  spec('Required, nothing matches', app(1, 'unbounded', 'IFCDOOR'), nameIs('x')) +
  spec('Optional, nothing matches', app(0, 'unbounded', 'IFCDOOR'), nameIs('x')) +
  spec('Prohibited, none found', app(0, 0, 'IFCDOOR')) +
  spec('Prohibited, found', app(0, 0, 'IFCWALL')) +
  spec('Unsafe pattern', app(1, 'unbounded', 'IFCWALL'), patternIs('(a+)+$')) +
  spec('Written for IFC2X3', app(0, 'unbounded', 'IFCWALL'), nameIs('Waldo'), 'IFC2X3'),
));
const uncheckedIds = write('one-unchecked.ids', idsText(
  spec('Required, met', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo')) +
  spec('Unsafe pattern', app(1, 'unbounded', 'IFCWALL'), patternIs('(a+)+$')),
));
const bigIfc = write(`walls-${WALLS}.ifc`, ifcText('IFC4', Array.from({ length: WALLS }, (_, i) => wall(i + 1, `Wall ${i + 1}`)).join('')));
const bigIds = write('walls-need-fire-rating.ids', idsText(spec(
  'Walls have a fire rating', app(1, 'unbounded', 'IFCWALL'),
  '<requirements><property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property></requirements>',
)));

// Words a BIM coordinator should never have to read.
const JARGON = /undefined|\bNaN\b|\[object|accessor|parse error|exception|stack|console|\bnull\b|TypeError|\.js\b/i;

/** Resident memory of every chrome-headless-shell process on this machine, before fn and at its peak while fn runs (MB). */
async function withPeakMemory(fn) {
  const rss = () => {
    try {
      return execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n')
        .filter((l) => l.includes('chrome-headless-shell')).reduce((s, l) => s + Number(l.trim().split(/\s+/)[0]), 0) / 1024;
    } catch { return 0; }
  };
  const before = rss();
  let peak = before;
  const timer = setInterval(() => { peak = Math.max(peak, rss()); }, 50);
  try { await fn(); } finally { clearInterval(timer); }
  return { before, peak };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  const blocked = [], local = [];
  let breakWorker = false;
  let workerDelay = 0;
  let slowEngine = 0;
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    // Hold the worker script back so a run is reliably still in progress when the test acts. The request itself stays local.
    if (workerDelay && /\/assets\/worker-/.test(u)) await new Promise((r) => setTimeout(r, workerDelay));
    if (slowEngine && /\/assets\/xmllint-browser/.test(u)) await new Promise((r) => setTimeout(r, slowEngine));
    if (breakWorker && /\/assets\/worker-/.test(u)) {
      return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("simulated crash at start");' });
    }
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) { local.push(u); return route.continue(); }
    blocked.push(u); return route.abort();
  });
  // Watches every change of the page. A result on screen carries the mark of the text it was made for (data-of);
  // the page carries the mark of the current text (data-doc). The two must never differ, and the record under a
  // verdict must never name another file than the one in the IDS box.
  await ctx.addInitScript(() => {
    window.__stale = [];
    window.__seen = 0;
    const look = () => {
      const pageEl = document.querySelector('.page');
      if (!pageEl) return;
      window.__seen++;
      const doc = pageEl.getAttribute('data-doc');
      for (const el of document.querySelectorAll('.title-block[data-of], .page-specs[data-of]')) {
        const of = el.getAttribute('data-of');
        const holdsResult = el.matches('.page-specs') ? el.querySelector('.state.pass, .state.fail, .state.nothing, .state.unchecked') : el.querySelector('.verdict.pass, .verdict.fail, .verdict.incomplete');
        if (holdsResult && of !== doc) window.__stale.push(`${el.className}: result of ${of} shown while the document is ${doc}`);
      }
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  const dialogs = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept().catch(() => {}); });
  // The page keeps one worker between runs, so a run is counted when it is asked of the worker, not when a worker starts.
  await ctx.addInitScript(() => {
    window.__runsStarted = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (m, ...rest) { if (m && m.type === 'run') window.__runsStarted++; return post.call(this, m, ...rest); };
  });
  const runsStarted = () => page.evaluate(() => window.__runsStarted);
  const resetRuns = () => page.evaluate(() => { window.__runsStarted = 0; });
  // The IFC parser starts a helper worker of its own from a blob: URL; only the app's worker is counted.
  const stale = [];
  const collectStale = async () => { stale.push(...await page.evaluate(() => window.__stale.splice(0)).catch(() => [])); };

  const idsInput = page.locator('input[type=file]').nth(0);
  const ifcInput = page.locator('input[type=file]').nth(1);
  const fileName = () => page.locator('#ids-status .file-name');
  const opened = (file) => fileName().filter({ hasText: path.basename(file) }).waitFor({ timeout: 20000 });
  const setFiles = async (idsFile, ifcFile) => {
    if (idsFile) await idsInput.setInputFiles(idsFile);
    if (ifcFile) await ifcInput.setInputFiles(ifcFile);
  };
  const fresh = async () => {
    await collectStale();
    // A draft left by the step before would be restored; each step starts from the empty page.
    await page.evaluate(() => sessionStorage.clear()).catch(() => {});
    await page.goto(origin + '/');
    dialogs.length = 0;
  };
  const load = async (idsFile, ifcFile) => { await fresh(); await setFiles(idsFile, ifcFile); };
  const runVerdict = page.locator('.title-block[data-kind="run"] .verdict');
  const headline = page.locator('.title-block .headline');
  const word = () => page.locator('.verdict-word').innerText().catch(() => '');
  /** A run result, a refusal, or Not valid: whatever ends the wait after files were given. */
  const settled = () => page.locator('.title-block[data-kind="run"] .headline, .error, .verdict.fail .verdict-word').first().waitFor({ timeout: 120000 });
  const checkSettled = () => page.locator('.verdict.pass, .verdict.fail, .verdict.incomplete, .error').first().waitFor({ timeout: 60000 });
  const pageText = () => page.locator('main').innerText();
  const specs = page.locator('.page-specs > .spec');
  const findingRows = page.locator('.findings.attached .finding');
  const download = async (button, name) => {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    const d = await dl;
    const p = path.join(out, name);
    await d.saveAs(p);
    return { path: p, text: fs.readFileSync(p, 'utf8'), file: d.suggestedFilename(), bytes: fs.statSync(p).size };
  };
  const downloadReport = async (name) => { const d = await download('Download report', name); return { ...d, json: JSON.parse(d.text) }; };
  const engine = (f) => JSON.parse(execFileSync(path.resolve('node_modules/.bin/vite-node'), ['scripts/engine-findings.ts', f], { encoding: 'utf8' }).split('@@')[1]);
  const noun = (n) => `${n} ${n === 1 ? 'problem' : 'problems'}`;
  const focused = () => page.evaluate(() => { const e = document.activeElement; return `${e.getAttribute('role') ?? e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 60)}`; });
  /** Drops files on the page itself, not on a box, the way a person drags them from a folder. */
  const dropOnPage = async (files, onlyHover = false) => {
    const payload = files.map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
    await page.evaluate(({ payload, onlyHover }) => {
      const dt = new DataTransfer();
      for (const p of payload) dt.items.add(new File([Uint8Array.from(atob(p.b64), (c) => c.charCodeAt(0))], p.name));
      const fire = (type) => document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire('dragenter'); fire('dragover');
      if (!onlyHover) fire('drop');
    }, { payload, onlyHover });
  };

  // ---- the empty page ---------------------------------------------------------
  await fresh();
  const firstPaint = [];
  const cold = await ctx.newPage();
  cold.on('request', (r) => firstPaint.push(new URL(r.url()).pathname));
  await cold.goto(origin + '/');
  await cold.locator('.drops').waitFor();
  await new Promise((r) => setTimeout(r, 800));
  const heavy = firstPaint.filter((p) => /xmllint|\/src-|schema-ifc|\/worker-|laz-perf|\/ifc-/.test(p));
  console.log(`FIRST PAINT of the empty page: ${firstPaint.length} requests: ${firstPaint.join(' ')}`);
  check('first paint of the empty page loads neither the Check engine, nor the IFC parser (worker), nor the IFC tables', heavy.length === 0, heavy.join(' '));
  await cold.close();
  check('one page: no tabs', (await page.getByRole('tab').count()) === 0 && (await page.getByRole('tablist').count()) === 0);
  check('empty page: two file boxes, IDS file and IFC model', (await page.locator('.drop').count()) === 2 && (await page.locator('.drop-label').allInnerTexts()).join(',') === 'IDS file,IFC model');
  check('empty page: Open, New and Try an example are offered; nothing else to press but Choose a model', (await page.locator('button').allInnerTexts()).join(',') === 'Open,New,Try an example,Choose a model', (await page.locator('button').allInnerTexts()).join(','));
  check('empty page: no verdict, no rows, no report, no fake content', (await page.locator('.verdict, .spec, .finding, .record').count()) === 0 && (await page.getByRole('button', { name: /Download/ }).count()) === 0);
  check('empty page says what to do next in one line', /^Open an IDS file, or drop an IDS file and an IFC model anywhere on this page\./.test(await page.locator('#next-step').innerText()));
  check('empty page: one primary action, Open', (await page.locator('.btn.primary').allInnerTexts()).join(',') === 'Open');
  check('the privacy line is on the page from the start', (await page.locator('.foot').innerText()).includes('Runs in your browser. Your files are not uploaded.'));
  check('a live region for announcements exists before any run, and is empty', (await page.locator('[aria-live=polite]').count()) === 1 && (await page.locator('[aria-live=polite]').innerText()).trim() === '');

  // ---- keyboard only: from the empty page to a result to an edit ------------------------------
  await fresh();
  // Another page was opened and closed above; the keyboard goes to the page that is in front.
  await page.bringToFront();
  await page.locator('h1').click();
  await page.keyboard.press('Tab');
  const f1 = await focused();
  const chooser1 = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Enter');
  await (await chooser1).setFiles(statesIds);
  await opened(statesIds);
  let f2 = '';
  for (let i = 0; i < 8 && f2 !== 'button:Choose a model'; i++) { await page.keyboard.press('Tab'); f2 = await focused(); }
  const chooser2 = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Space');
  await (await chooser2).setFiles(goodIfc);
  await settled();
  check('keyboard: Open is the first stop, and both files are taken with Enter or Space', f1 === 'button:Open' && f2 === 'button:Choose a model' && (await page.locator('.drop-detail').nth(0).innerText()).includes('states.ids') && (await page.locator('.drop-detail').nth(1).innerText()).includes('two-walls.ifc'), [f1, f2].join(' > '));
  const stops = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); stops.push(await focused()); if (/^summary:/.test(stops[stops.length - 1])) break; }
  check('keyboard: after the result come Download failing elements, Download report, About, then the rows', stops.indexOf('button:Download failing elements') !== -1 && stops.indexOf('button:Download report') > stops.indexOf('button:Download failing elements') && stops.includes('button:Edit Required, met') && /^summary:Show the 2 failing elements, by reason/.test(stops[stops.length - 1]), stops.join(' > '));
  await page.keyboard.press('Enter');
  const kOpened = await page.evaluate(() => document.activeElement.parentElement.open);
  check('focus is visible on the focused row', await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
  await page.keyboard.press('Space');
  const kClosed = await page.evaluate(() => !document.activeElement.parentElement.open);
  check('a row opens and closes from the keyboard', kOpened && kClosed);
  await page.keyboard.press('Shift+Tab');
  let kEdit = await focused();
  // IfcWall has subtypes: the action that adds them is one stop between the results and the row's Edit button.
  if (/^button:Also apply it to/.test(kEdit)) { await page.keyboard.press('Shift+Tab'); kEdit = await focused(); }
  await page.keyboard.press('Enter');
  let kField = '';
  for (let i = 0; i < 12 && !/^combobox:.*$/.test(kField); i++) { await page.keyboard.press('Tab'); kField = await page.evaluate(() => { const e = document.activeElement; return `${e.getAttribute('role') ?? e.tagName.toLowerCase()}:${e.labels?.[0]?.textContent ?? ''}`; }); }
  await page.keyboard.type('door');
  await page.locator('[role=option]').first().waitFor({ timeout: 20000 });
  const kExpanded = await page.evaluate(() => { const e = document.activeElement; return `${e.getAttribute('aria-expanded')}|${e.getAttribute('aria-autocomplete')}|${document.getElementById(e.getAttribute('aria-activedescendant') ?? '')?.getAttribute('role')}|${document.getElementById(e.getAttribute('aria-controls'))?.getAttribute('role')}`; });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await specs.nth(1).locator('.spec-words', { hasText: /^Every door/ }).waitFor({ timeout: 20000 });
  await runVerdict.waitFor({ timeout: 60000 });
  check('keyboard: Edit opens the form, a pick-list is a combobox with a list (arrows, Enter), and the change gives a new result', kEdit === 'button:Edit Required, broken' && kField === 'combobox:IFC class' && kExpanded === 'true|list|option|listbox' && /^4 of 8 specifications passed\./.test(await headline.innerText()) && /\(with unsaved changes\)/.test(await page.locator('.record').innerText()), [kEdit, kField, kExpanded, await headline.innerText()].join(' > '));

  // ---- official pass pair -----------------------------------------------------
  const pass = 'pass-a_minimal_ids_can_check_a_minimal_ifc_2_2';
  await resetRuns();
  await load(path.join(cases, pass + '.ids'), path.join(cases, pass + '.ifc'));
  await settled();
  const h1 = await headline.innerText();
  check('pass pair headline', h1 === 'The one specification passed.' && (await word()) === 'Pass', h1);
  check('pass pair row state Pass', (await specs.first().locator('.state').innerText()) === 'Pass');
  check('a valid IDS file and a model run by themselves: no button was pressed, one run started', (await runsStarted()) === 1 && (await page.getByRole('button', { name: /^Run$/ }).count()) === 0, `runs started: ${await runsStarted()}`);
  check('file names and sizes shown in the boxes', (await page.locator('.drop-detail').first().innerText()).includes(pass + '.ids') && /\(\d/.test(await page.locator('.drop-detail').nth(1).innerText()));
  check('result names both files', (await page.locator('.record').innerText()).includes(pass + '.ids') && (await page.locator('.record').innerText()).includes(pass + '.ifc'));
  check('result says the IDS file was checked first and is valid', (await page.locator('.meta.notice').innerText()) === 'The IDS file was checked first and is valid.');
  check('headline sits inside the live region', (await page.locator('[aria-live=polite] .headline').count()) === 1);
  const rep1 = await downloadReport('report-pass.json');
  check('report download is JSON with the check and the run', rep1.json.check.valid === true && Array.isArray(rep1.json.run.specs) && rep1.json.run.specs.length === 1 && rep1.json.run.verdict === 'pass' && rep1.json.edited === false && rep1.file === pass + '-ids-report.json', rep1.file);
  check('pass: one primary action, Download report; and the next step is said', (await page.locator('.btn.primary').allInnerTexts()).join(',') === 'Download report' && /Nothing failed/.test(await page.locator('#next-step').innerText()));

  // ---- official fail pair -----------------------------------------------------
  const fail = 'fail-a_minimal_ids_can_check_a_minimal_ifc_1_2';
  await load(path.join(cases, fail + '.ids'), path.join(cases, fail + '.ifc'));
  await settled();
  const h2 = await headline.innerText();
  check('fail pair headline', /^0 of 1 specification passed\./.test(h2) && (await word()) === 'Fail', h2);
  check('fail pair row state Fail', (await specs.first().locator('.state').innerText()) === 'Fail');
  await page.locator('details.fails > summary').first().click();
  const rows = await page.locator('.spec tbody tr').count();
  check('failing element listed', rows >= 1, `${rows} row(s): ${await page.locator('.spec tbody tr').first().innerText()}`);
  check('fail: one primary action, Download failing elements', (await page.locator('.btn.primary').allInnerTexts()).join(',') === 'Download failing elements' && /Send the failing elements/.test(await page.locator('#next-step').innerText()));

  // ---- ifcVersion: checked anyway, with a note --------------------------------
  const meta = 'pass-specification_version_is_purely_metadata_and_does_not_impact_pass_or_fail_result';
  await load(path.join(cases, meta + '.ids'), path.join(cases, meta + '.ifc'));
  await settled();
  check('IFC2X3 specification on an IFC4 model is checked and passes', (await headline.innerText()) === 'The one specification passed.' && (await page.locator('.error').count()) === 0);
  const sn = await page.locator('.spec .schema-note').innerText().catch(() => '');
  check('the row says the model version is not one the specification lists', /The model is IFC4, but this specification lists IFC2X3\. It was checked anyway/.test(sn), sn);
  const req22 = 'fail-required_specifications_need_at_least_one_applicable_entity_2_2';
  await load(path.join(cases, req22 + '.ids'), path.join(cases, req22 + '.ifc'));
  await settled();
  check('IFC2X3 specification that fails on an IFC4 model fails for its own reason', /^0 of 1/.test(await headline.innerText()) && /needs at least one matching element/.test(await pageText()));

  // ---- every state on one page ------------------------------------------------
  await load(statesIds, goodIfc);
  await settled();
  const states = await specs.evaluateAll((els) => els.map((e) => ({
    name: e.querySelector('.spec-name').textContent, state: e.querySelector('.state').textContent.trim(), counts: e.querySelector('.spec-counts').textContent, notes: [...e.querySelectorAll(':scope > .note')].map((n) => n.textContent).join(' '),
  })));
  const st = Object.fromEntries(states.map((s) => [s.name, s]));
  console.log('STATE TABLE (as shown on the page)');
  for (const s of states) console.log(`   ${s.name} | ${s.state} | ${s.counts} | ${s.notes}`);
  const hs = await headline.innerText();
  console.log(`   headline: ${hs}`);
  check('states headline counts passed, failed and unchecked separately', hs === '4 of 8 specifications passed. 3 failed. 1 could not be checked. 1 optional specification matched nothing in this model, so there was nothing to check there.', hs);
  check('states headline is styled as a failure', (await headline.getAttribute('class')).includes('fail') && (await word()) === 'Fail');
  check('required and met shows Pass', st['Required, met'].state.includes('Pass') && st['Required, met'].counts.startsWith('Applied to 2 elements: 2 passed, 0 failed.'));
  check('required and broken shows Fail with counts', st['Required, broken'].state.includes('Fail') && st['Required, broken'].counts.startsWith('Applied to 2 elements: 0 passed, 2 failed.'));
  check('required with nothing matching shows Fail and why', st['Required, nothing matches'].state.includes('Fail') && /needs at least one matching element/.test(st['Required, nothing matches'].notes));
  check('optional with nothing matching shows Nothing to check', st['Optional, nothing matches'].state.includes('Nothing to check'));
  check('prohibited and none found shows Pass', st['Prohibited, none found'].state.includes('Pass') && st['Prohibited, none found'].counts.startsWith('None found in the model'));
  check('prohibited and found shows Fail and never "2 passed"', st['Prohibited, found'].state.includes('Fail') && st['Prohibited, found'].counts.startsWith('Found 2 elements that must not be in the model.') && !/2 passed/.test(st['Prohibited, found'].counts));
  check('an unsafe pattern shows Not checked and what to do', st['Unsafe pattern'].state.includes('Not checked') && /Simplify the pattern/.test(st['Unsafe pattern'].notes));
  check('IFC2X3 specification shows Pass with the version note', st['Written for IFC2X3'].state.includes('Pass') && /lists IFC2X3/.test(st['Written for IFC2X3'].notes));
  // The mark is drawn by the stylesheet in front of the word: a different box for each state.
  const marks = await page.locator('.spec .state').evaluateAll((els) => els.map((e) => {
    const m = getComputedStyle(e, '::before');
    const shape = m.maskImage && m.maskImage !== 'none' ? m.maskImage : `box ${m.borderTopWidth} ${m.borderTopStyle}`;
    return { state: e.className.replace('state ', ''), shape, size: parseFloat(m.width) };
  }));
  const shapeOf = Object.fromEntries(marks.map((m) => [m.state, m.shape]));
  check('every state has a word and a mark, not colour alone',
    states.every((s) => /^(Pass|Fail|Nothing to check|Not checked)$/.test(s.state)) && marks.every((m) => m.size >= 16 && m.shape !== 'box 0px none') && new Set(Object.values(shapeOf)).size === 4,
    `${states.map((s) => s.state).join(' / ')} | ${Object.keys(shapeOf).length} states, ${new Set(Object.values(shapeOf)).size} different marks`);
  const prohibitedRow = specs.filter({ hasText: 'Prohibited, found' });
  await prohibitedRow.locator('details.fails > summary').click();
  check('prohibited and found lists the elements that must not be there, under the reason said once', (await prohibitedRow.locator('tbody tr').count()) === 2 && (await prohibitedRow.locator('.group-reason').allInnerTexts()).join('|') === '2 elements: This element must not be in the model.');
  check('every specification row reads as a sentence', (await specs.first().locator('.spec-words').innerText()) === 'Every wall must have the attribute Name set to "Waldo". The model must contain at least one wall.');
  check('no jargon in the states page', !JARGON.test(await pageText()), (await pageText()).match(JARGON)?.[0] ?? '');
  await page.screenshot({ path: path.join(out, 'shot-states.png'), fullPage: true });

  await load(uncheckedIds, goodIfc);
  await settled();
  const hu = await headline.innerText();
  check('one pass and one unchecked is not "all passed"', hu === '1 of 2 specifications passed. 1 could not be checked.' && (await headline.getAttribute('class')).includes('incomplete') && (await word()) === 'Incomplete', hu);

  // ---- inputs that lie --------------------------------------------------------
  const noRun = async () => (await runVerdict.count()) === 0 && (await page.locator('.state.pass, .state.fail, .state.nothing, .state.unchecked').count()) === 0 && !/0 of 0/.test(await pageText());
  /** A model that cannot be used: [label, ifc file, pattern]. The IDS file is valid; the model is refused with a sentence. */
  const badModels = [
    ['IFC with a valid header and a cut-off body', write('cut-off.ifc', twoWalls.slice(0, twoWalls.indexOf('#2=') + 20)), /cut off/],
    ['zipped IFC named .ifc', write('zipped.ifc', Buffer.concat([Buffer.from('PK\u0003\u0004\u0014\0\0\0\0\0a.ifc', 'latin1'), Buffer.from(twoWalls)])), /zipped.*Unzip/],
    ['ifcXML named .ifc', write('xml.ifc', '<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2"><IfcWall id="i1"/></ifcXML>'), /XML format.*Export the model as \.ifc/],
    ['empty IFC file', write('empty.ifc', ''), /IFC file is empty/],
    ['IFC with a header and no data', write('no-data.ifc', ifcText('IFC4', '')), /no model data/],
    ['IFC2X2 model', write('ifc2x2.ifc', ifcText('IFC2X2_FINAL', wall(1))), /This model is IFC2X2_FINAL\. IDS covers IFC2X3, IFC4 and IFC4X3 only/],
    ['text file named .ifc', write('text.ifc', 'this is not a model'), /not an IFC model that idsbench can read/],
  ];
  for (const [label, ifcFile, pattern] of badModels) {
    await load(goodIds, ifcFile);
    await settled();
    const msg = await page.locator('.model-refusal .error').innerText().catch(() => '');
    check(`${label}: plain sentence, no verdict on the model`, pattern.test(msg) && (await noRun()) && !JARGON.test(msg) && (await word()) === 'Valid' && (await page.locator('.drop').nth(1).getAttribute('class')).includes('invalid'), msg || '(no message; a result was shown)');
  }
  /** A file that is not an IDS file at all: [label, file, pattern]. It is not opened; one sentence says why. */
  const notIds = [
    ['IDS that is not XML', write('text.ids', 'this is not xml'), /^text\.ids was not opened\. This file is not XML, so it is not an IDS file\. Check that you chose the right file\.$/],
    ['empty IDS file', write('empty.ids', ''), /^empty\.ids was not opened\. This file is empty\. Choose the IDS file again/],
    ['HTML page named .ids', write('page.ids', '<html><body>hello</body></html>'), /^page\.ids was not opened\. This is an XML file but not an IDS file: it starts with <html>, not <ids>\./],
  ];
  for (const [label, idsFile, pattern] of notIds) {
    await load(idsFile, goodIfc);
    await page.locator('.file-refusal .error').waitFor({ timeout: 60000 });
    const msg = await page.locator('.file-refusal .error').innerText();
    check(`${label}: plain sentence, no verdict, no rows, no report`, pattern.test(msg) && (await noRun()) && (await page.locator('.verdict, .finding, .spec').count()) === 0 && (await page.getByRole('button', { name: 'Download report' }).count()) === 0 && !JARGON.test(msg), msg);
  }
  /** An IDS file with problems: [label, file, headline pattern]. Shown as Not valid with its findings; the model waits. */
  const cutOffIds = write('cut-off.ids', fs.readFileSync(goodIds, 'utf8').slice(0, -90));
  const oldDraft = write('draft.ids', idsText(spec('s', app(1, 'unbounded', 'IFCWALL')), `xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/0.9.7/ids.xsd"`));
  const noSpecsIds = write('no-specifications.ids', idsText(''));
  const invalidIds = [
    ['IDS cut off', cutOffIds, /not valid XML, so it could not be checked further\. Open it in the tool that made it, save it again/, 1],
    ['IDS with the wrong namespace', write('wrong-namespace.ids', idsText(spec('s', app(1, 'unbounded', 'IFCWALL')), 'xmlns="http://example.com/not-ids"')), /^This IDS file has 1 problem\./, 1],
    ['IDS with no specifications', noSpecsIds, /^This IDS file has 1 problem\./, 1],
    ['IDS 0.9.7 (refused: idsbench reads IDS 1.0 only)', oldDraft, /^This IDS file has 1 problem\./, 1],
  ];
  for (const [label, idsFile, pattern, count] of invalidIds) {
    await load(idsFile, goodIfc);
    await settled();
    const msg = await headline.innerText().catch(() => '');
    check(`${label}: Not valid, its problems listed on the page, and the model is not run`, (await word()) === 'Not valid' && pattern.test(msg) && /The model is checked as soon as the file is valid\.$/.test(msg) && (await noRun()) && (await page.locator('.fix-line').count()) === count && !JARGON.test(msg), msg);
  }
  // (the last of those is on screen: an IDS 0.9.7 file with a model waiting)
  await idsInput.setInputFiles(goodIds);
  await opened(goodIds);
  await settled();
  check('opening a valid IDS file after one that was not valid clears the problems and runs the waiting model', (await headline.innerText()) === 'The one specification passed.' && (await page.locator('.to-fix, .finding, .error').count()) === 0 && (await page.locator('.meta.notice').innerText()) === 'The IDS file was checked first and is valid.');
  await load(oldDraft, null);
  await checkSettled();
  const draftSaid = (await page.locator('.fix-line .fix-text').innerText()).split('\nDetails')[0];
  await page.locator('.fix-line .fix-details > summary').click();
  const draftEngine = await page.locator('.fix-line .technical').first().innerText();
  check('an IDS 0.9.7 file: one plain sentence, the engine\'s own behind Details, and it cannot be edited here', /^This file is IDS 0\.9\.7, an older draft\. idsbench works with IDS 1\.0 only: update the file to version 1\.0 in the tool that made it\.$/.test(draftSaid) && draftEngine === 'What the check engine says: This file is IDS 0.9.7. idsbench works with IDS 1.0 only. Update the file to version 1.0 and check it again.' && (await page.getByRole('button', { name: /^(Fix|Edit)/ }).count()) === 0 && /cannot be changed here/.test(await page.locator('.to-fix').innerText()), draftSaid);
  // A file in the wrong box is recognised by what it holds.
  await load(null, null);
  await ifcInput.setInputFiles(goodIds);
  await opened(goodIds);
  check('IDS file in the IFC box: recognised as the IDS file and opened as that', (await page.locator('.drop-detail').first().innerText()).includes('walls-named-waldo.ids') && (await page.locator('.drop-detail').nth(1).innerText()).startsWith('Optional.') && (await page.locator('.error').count()) === 0);
  await load(null, null);
  await idsInput.setInputFiles(goodIfc);
  await page.locator('.drop-detail').nth(1).filter({ hasText: 'two-walls.ifc' }).waitFor();
  check('IFC model in the IDS box: recognised as the model', (await page.locator('.drop-detail').first().innerText()).startsWith('No file yet.') && (await page.locator('.error').count()) === 0);
  await ifcInput.setInputFiles(goodIds);
  await settled();
  check('both files in the wrong boxes: each goes where it belongs and the pair runs', (await headline.innerText()) === 'The one specification passed.' && (await page.locator('.record').innerText()).includes('two-walls.ifc'));
  const bom = write('bom.ifc', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(twoWalls)]));
  await load(goodIds, bom);
  await settled();
  check('IFC with a UTF-8 byte order mark is checked', (await headline.innerText().catch(() => '')) === 'The one specification passed.');
  const oneLine = write('one-line.ifc', ifcText('IFC4', Array.from({ length: 3000 }, (_, i) => wall(i + 1)).join('')).replace(/\n/g, ''));
  await load(goodIds, oneLine);
  await settled();
  check('IFC written as one long line is checked, all 3,000 walls', (await pageText()).includes('Applied to 3,000 elements: 3,000 passed, 0 failed.'));

  // ---- files dropped anywhere on the page, the example ----------------------------
  await fresh();
  await dropOnPage([goodIfc, goodIds], true);
  check('files dragged over the page: the whole page says it takes them', (await page.locator('.drop-overlay').innerText()) === 'Drop an IDS file, an IFC model, or both.');
  await dropOnPage([goodIfc, goodIds]);
  await settled();
  check('both files dropped at once anywhere on the page: told apart by content, and run', (await page.locator('.drop-overlay').count()) === 0 && (await headline.innerText()) === 'The one specification passed.' && (await page.locator('.drop-detail').first().innerText()).includes('walls-named-waldo.ids') && (await page.locator('.drop-detail').nth(1).innerText()).includes('two-walls.ifc'));
  await fresh();
  await page.getByRole('button', { name: 'Try an example' }).click();
  await settled();
  const exStates = await specs.locator('.state').allInnerTexts();
  check('Try an example: a bundled IDS file and model give a mixed result at once', exStates.join(',') === 'Fail,Pass,Nothing to check' && (await word()) === 'Fail' && blocked.length === 0, exStates.join(','));
  check('the example is marked as an example and can be cleared in one press', (await page.locator('.drop').first().innerText()).includes('This is the example that ships with idsbench, not a file of yours.') && (await page.getByRole('button', { name: 'Clear the example' }).count()) === 1);
  await page.getByRole('button', { name: 'Clear the example' }).click();
  check('clearing the example gives the empty page back', (await page.locator('.verdict, .spec').count()) === 0 && (await page.getByRole('button', { name: 'Try an example' }).count()) === 1 && (await page.locator('.drop-detail').nth(1).innerText()).startsWith('Optional.'));

  // ---- failing elements: grouped by reason, and the CSV hand-over ----------------------
  const mixedIfc = write('mixed walls.ifc', ifcText('IFC4', "#1=IFCWALL('0000000000000000000001',$,'Waldo','has a description',$,$,$,$,$);\n" + wall(2, 'Wand "Süd", außen') + wall(3, 'Ușă, perete') + wall(4, 'Wilma')));
  const twoReqIds = write('two-requirements.ids', idsText(spec('Walls, &quot;named&quot; and described', app(1, 'unbounded', 'IFCWALL'),
    '<requirements><attribute><name><simpleValue>Description</simpleValue></name></attribute><property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property></requirements>')));
  await load(twoReqIds, mixedIfc);
  await settled();
  await page.locator('details.fails > summary').first().click();
  const groupHeads = await page.locator('.group-reason').allInnerTexts();
  const groupRows = await page.locator('.fail-group').evaluateAll((els) => els.map((e) => e.querySelectorAll('tbody tr').length));
  const groupTotal = groupHeads.reduce((n, h) => n + Number(/^(\d+) element/.exec(h)[1]), 0);
  check('failing elements are grouped by reason: each reason once, with its count, and the counts add up to the engine\'s number', groupHeads.length === 2 && groupTotal === 4 && groupRows.join(',') === '1,3' && (await specs.first().locator('.spec-counts').innerText()).startsWith('Applied to 4 elements: 0 passed, 4 failed.'), groupHeads.join(' | '));
  check('the reason is not repeated on every row', (await page.locator('.fail-group thead th').first().locator('xpath=..').locator('th').allInnerTexts()).join(',') === 'IFC class,Name,GlobalId');
  const csv = await download('Download failing elements', 'failing.csv');
  const csvBytes = fs.readFileSync(csv.path);
  const csvLines = csv.text.replace(/^﻿/, '').split('\r\n');
  check('Download failing elements: a CSV named after the model, UTF-8 with a byte order mark, CRLF, one row per failing element, each marked as an element row', csv.file === 'mixed walls-failing-elements.csv' && csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csvLines[0] === 'Row about,Specification,Requirement,Why it failed,What to fix,IFC class,Name,GlobalId,Storey or space,Model,IDS file' && csvLines.length === 4 + 2 && csvLines[5] === '', `${csv.file}: ${csvLines.length - 2} rows`);
  check('CSV: commas and quotes are quoted, letters outside ASCII are kept', csvLines[2].includes(',"Wand ""Süd"", außen",0000000000000000000002,,mixed walls.ifc,two-requirements.ids') && csvLines[2].startsWith('Element,"Walls, ""named"" and described",') && csvLines[3].includes('"Ușă, perete"'), csvLines[2]);

  const bcf = await download('Download as BCF', 'failing.bcfzip');
  const bcfZip = unzipSync(new Uint8Array(fs.readFileSync(bcf.path)));
  const bcfMarkups = Object.keys(bcfZip).filter((f) => f.endsWith('/markup.bcf')).map((f) => strFromU8(bcfZip[f]));
  const bcfGuids = Object.keys(bcfZip).filter((f) => f.endsWith('.bcfv')).flatMap((f) => [...strFromU8(bcfZip[f]).matchAll(/IfcGuid="([^"]*)"/g)].map((m) => m[1])).sort();
  check('Download as BCF: a .bcfzip named after the model, BCF 2.1, a topic for each of the two reasons, an open Issue labelled with the specification, and the four failing GlobalIds', bcf.file === 'mixed walls-failing-elements.bcfzip' && strFromU8(bcfZip['bcf.version']).includes('VersionId="2.1"') && bcfMarkups.length === groupHeads.length && bcfMarkups.every((m) => m.includes('TopicType="Issue"') && m.includes('TopicStatus="Open"') && m.includes('<Labels>Walls, &quot;named&quot; and described</Labels>')) && bcfGuids.join(',') === ['0000000000000000000001', '0000000000000000000002', '0000000000000000000003', '0000000000000000000004'].join(','), `${bcf.file}: ${bcfMarkups.length} topics, ${bcfGuids.length} components`);

  // ---- the worker -------------------------------------------------------------
  // A second pair after a first: the old result goes the moment a file changes.
  await load(goodIds, goodIfc);
  await settled();
  check('first pair passes', (await headline.innerText()) === 'The one specification passed.');
  await idsInput.setInputFiles(otherIds);
  await opened(otherIds);
  check('choosing another file removes the previous result at once', !(await pageText()).includes('Walls are named Waldo') && !(await pageText()).includes('The one specification passed.'));
  await settled();
  const second = await pageText();
  check('second pair shows its own result under its own names', /^0 of 1/.test(await headline.innerText()) && second.includes('Walls are named Wilma') && /IDS file\s+walls-named-wilma\.ids/.test(second) && !second.includes('Walls are named Waldo'));

  // Changing a file while a run is in progress: the run must not deliver.
  await fresh();
  await resetRuns();
  workerDelay = 3000;
  await setFiles(bigIds, bigIfc);
  await page.locator('.verdict.waiting .working').filter({ hasText: /IFC model|Checking the model|Checking the IDS file/ }).waitFor({ timeout: 10000 });
  check('while a run is in progress the stamp cell is not a verdict: it says Checking, with what is being done', (await word()) === 'Checking' && (await page.locator('.verdict.waiting').count()) === 1 && (await specs.first().locator('.state').innerText()) === 'Checking' && (await runVerdict.count()) === 0);
  await idsInput.setInputFiles(goodIds);
  await opened(goodIds);
  check('changing a file during a run stops it: nothing of the first pair remains', !(await pageText()).includes('Walls have a fire rating') && (await runVerdict.count()) === 0);
  workerDelay = 0;
  await page.waitForTimeout(8000);
  check('the stopped run never shows a result under the new file name', !(await pageText()).includes('Walls have a fire rating') && (await page.locator('.record').innerText()).includes('walls-named-waldo.ids'));
  await ifcInput.setInputFiles(goodIfc);
  await settled();
  check('a run after a stopped run gives the new pair its own result', (await headline.innerText()) === 'The one specification passed.' && /Model\s+two-walls\.ifc/.test(await pageText()));

  // The worker fails to start or crashes.
  breakWorker = true;
  await load(goodIds, goodIfc);
  await settled();
  const crash = await page.locator('.model-refusal .error').innerText().catch(() => '');
  check('a crashed worker gives a plain sentence and no result', /did not finish, so there is no result/.test(crash) && !JARGON.test(crash) && (await runVerdict.count()) === 0, crash);
  breakWorker = false;
  await page.getByRole('button', { name: 'Run again' }).click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('Run again works after a crash', (await headline.innerText()) === 'The one specification passed.' && (await page.locator('.error').count()) === 0);
  const expectedPageErrors = pageErrors.splice(0).filter((e) => !/simulated crash at start/.test(e));

  // ---- the IDS file alone: is it valid, and where is it wrong ------------------------
  const shots = path.resolve('.scratch/shots');
  fs.mkdirSync(shots, { recursive: true });
  const officialInvalid = path.join(cases, 'invalid-prohibited_specifications_invalid_if_requirements_are_specified.ids');
  const officialInvalidIfc = officialInvalid.replace(/\.ids$/, '.ifc');
  const ref = engine(officialInvalid);
  const refErrors = ref.findings.filter((f) => f.severity === 'error').length;
  check('the engine rejects the official invalid file, with a position', !ref.valid && ref.findings.length >= 1 && ref.findings[0].line > 0, JSON.stringify(ref.findings.map((f) => f.code)));

  // valid file
  await load(goodIds, null);
  await checkSettled();
  check('valid file: headline in words, no extra button pressed', (await headline.innerText()) === 'This IDS file is valid.' && (await headline.getAttribute('class')).includes('pass') && (await word()) === 'Valid');
  check('valid file: version found is shown, no rows', /IDS version\s+1\.0/.test(await page.locator('.record').innerText()) && (await page.locator('.finding, .fix-line').count()) === 0);
  check('valid file, no model: the stamp is about the file (Valid), never Pass, and the rows carry no state', (await runVerdict.count()) === 0 && (await page.locator('.spec .state').count()) === 0 && /Model\s+none yet/.test(await page.locator('.record').innerText()));
  check('valid file, no model: the next step and the one primary action are the model', (await page.locator('.btn.primary').allInnerTexts()).join(',') === 'Choose a model' && /Add an IFC model/.test(await page.locator('#next-step').innerText()));
  const validRep = await downloadReport('check-valid.json');
  check('valid file: report is one JSON file named after the IDS file', validRep.json.check.valid === true && validRep.json.idsFile === 'walls-named-waldo.ids' && validRep.json.check.findings.length === 0 && validRep.json.run === null && validRep.file === 'walls-named-waldo-check-report.json', validRep.file);

  // invalid official file
  await idsInput.setInputFiles(officialInvalid);
  await opened(officialInvalid);
  await checkSettled();
  const head = await headline.innerText();
  check('invalid official file: headline counts the engine\'s errors', head === `This IDS file has ${noun(refErrors)}.` && (await headline.getAttribute('class')).includes('fail') && (await word()) === 'Not valid', head);
  const rowCount = await findingRows.count();
  check('invalid official file: one row per engine finding', rowCount === ref.findings.length, `${rowCount} rows, engine ${ref.findings.length}`);
  check('findings are attached to the specification they concern', (await specs.first().locator('.finding').count()) === ref.findings.length && ref.findings.every((f) => /specification/.test(f.path)));
  const r0 = findingRows.first();
  const r0text = await r0.innerText();
  const f0 = ref.findings[0];
  check('first row: the plain sentence, position and short code, with Details', r0text.includes('A specification that says elements must not exist cannot also list what they must have.') && r0text.includes('Details') && r0text.includes(f0.column ? `line ${f0.line}, column ${f0.column}` : `line ${f0.line}`) && (await r0.locator('code').innerText()) === f0.code, r0text.replace(/\n/g, ' | '));
  check('rows start closed', (await page.locator('.excerpt').count()) === 0);
  await r0.locator('summary').click();
  const ex = await r0.locator('.excerpt').innerText();
  check('opened, the row shows the engine\'s own sentence beside the plain one', (await r0.locator('.technical').innerText()) === `What the check engine says: ${f0.message}`);
  const sourceLines = fs.readFileSync(officialInvalid, 'utf8').split(/\r\n|\n|\r/);
  const marked = ex.split('\n').find((l) => l.startsWith('>'));
  check('excerpt marks the engine\'s line and shows that line of the file', marked !== undefined && marked.includes(sourceLines[f0.line - 1].trim()) && marked.includes(`${f0.line} |`), marked);
  const exLines = ex.split('\n').filter((l) => /^[> ] *\d+ \|/.test(l));
  check('excerpt has two lines of context each side (when the file has them)', exLines.length === Math.min(sourceLines.length, f0.line + 2) - Math.max(1, f0.line - 2) + 1, `${exLines.length} lines`);
  check('excerpt is monospaced, scrolls sideways, and is plain text', await r0.locator('.excerpt').evaluate((e) => { const c = getComputedStyle(e); return c.whiteSpace === 'pre' && c.overflowX === 'auto' && /mono|Menlo|Consolas/i.test(c.fontFamily) && e.children.length === 0; }));
  check('an unedited file is checked on its own text: the excerpt is the file\'s line, character for character', ex.split('\n').filter((l) => /^[> ] *\d+ \|/.test(l)).every((l) => { const m = /^[> ] *(\d+) \| (.*)$/.exec(l); return m && sourceLines[Number(m[1]) - 1] === m[2]; }));
  const invRep = (await downloadReport('check-invalid.json')).json;
  check('report holds the same findings as the engine', invRep.check.valid === false && JSON.stringify(invRep.check.findings) === JSON.stringify(ref.findings) && invRep.check.errors === refErrors);
  await page.screenshot({ path: path.join(shots, 'check-invalid-row-open.png'), fullPage: true });

  // XML that breaks off keeps its position
  await load(cutOffIds, null);
  await checkSettled();
  check('XML cut off: a sentence says what to do and one row points at the break', /not valid XML, so it could not be checked further\. Open it in the tool that made it, save it again/.test(await headline.innerText()) && (await findingRows.count()) === 1 && (await page.getByRole('button', { name: /^Fix/ }).count()) === 0);

  // the old result goes the moment another file is chosen, and a slower check never overtakes a later one
  await load(officialInvalid, null);
  await checkSettled();
  slowEngine = 2500;
  await idsInput.setInputFiles(goodIds);
  await opened(goodIds);
  check('choosing another file removes the old rows, headline and report at once', (await page.locator('.finding, .excerpt, .fix-line, .verdict.fail').count()) === 0 && (await page.getByRole('button', { name: 'Download report' }).count()) === 0 && (await page.locator('.working').innerText()) === 'Checking the IDS file...');
  await idsInput.setInputFiles(otherIds);
  await idsInput.setInputFiles(officialInvalid);
  await opened(officialInvalid);
  await checkSettled();
  await page.waitForTimeout(3500);
  check('of three files chosen in a row, only the last one shows a result', (await headline.innerText()) === `This IDS file has ${noun(refErrors)}.` && (await page.locator('.drop-detail').first().innerText()).includes('invalid-prohibited'));
  slowEngine = 0;

  // ---- a model waiting on an IDS file that is not valid; the fix made in place ----------------
  await load(officialInvalid, officialInvalidIfc);
  await settled();
  const waitingText = await headline.innerText();
  await resetRuns();
  check('a model with an IDS file that is not valid: the model waits, one sentence says the file comes first, nothing is run', waitingText === `This IDS file has ${noun(refErrors)}. The model is checked as soon as the file is valid.` && (await noRun()) && (await specs.first().locator('.state').innerText()) === 'Waiting' && (await runsStarted()) === 0, waitingText);
  check('...with its findings on the same page, one row per engine finding, and the list of things to fix', (await findingRows.count()) === ref.findings.length && (await findingRows.first().innerText()).includes('A specification that says elements must not exist cannot also list what they must have.') && (await page.locator('.to-fix h3').innerText()) === `${ref.findings.length} thing to fix in this IDS file`);
  await page.screenshot({ path: path.join(shots, 'model-waiting.png'), fullPage: true });
  const oneFix = page.getByRole('button', { name: 'Remove the 1 "Must have" item' });
  await oneFix.waitFor({ timeout: 20000 });
  check('a one-press fix is offered on the line, beside Fix', (await page.locator('.fix-line .row-actions').innerText()).replace(/\s+/g, ' ') === 'Remove the 1 "Must have" item Fix');
  await oneFix.click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('pressing it makes the file valid, the list goes, and the waiting model runs by itself', (await page.locator('.to-fix, .finding').count()) === 0 && ['Pass', 'Fail'].includes(await word()) && (await runsStarted()) === 1 && (await page.locator('.meta.notice').innerText()) === 'The IDS file was checked first and is valid.', await headline.innerText());
  check('the result names what was judged: the file with unsaved changes', /IDS file\s+invalid-prohibited[^\n]*\(with unsaved changes\)/.test(await page.locator('.record').innerText()) && (await page.locator('#ids-status').innerText()).includes('unsaved changes'));
  check('the fix can be undone: nothing is applied silently', (await page.locator('.undo').innerText()).startsWith('Remove the 1 "Must have" item.') && (await page.getByRole('button', { name: 'Undo' }).count()) === 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.locator('.verdict.fail .verdict-word', { hasText: 'Not valid' }).waitFor();
  check('Undo brings the file back as it was opened: Not valid again, no unsaved changes, the result gone', (await noRun()) && !(await page.locator('#ids-status').innerText()).includes('unsaved changes') && (await findingRows.count()) === ref.findings.length);

  // "Fix" opens the place and puts the keyboard in the field concerned
  const wrongClass = write('wrong-class.ids', idsText(spec('Walls are named Waldo', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo')) + spec('Rabbits are named', app(1, 'unbounded', 'IFCRABBIT'), nameIs('x'))));
  await load(wrongClass, goodIfc);
  await settled();
  check('a problem with no known answer has Fix and no one-press button', (await page.locator('.fix-line .row-actions').innerText()).trim() === 'Fix' && (await page.locator('.fix-line .fix-text').innerText()).includes('Specification 2.'));
  check('not valid: the one primary action is Edit on the specification with the problem', (await page.locator('.btn.primary').count()) === 1 && (await page.locator('.btn.primary').getAttribute('aria-label')) === 'Edit Rabbits are named');
  await page.getByRole('button', { name: /^Fix:/ }).click();
  const landed = await page.evaluate(() => { const e = document.activeElement; return { role: e.getAttribute('role'), label: e.labels?.[0]?.textContent, value: e.value, spec: e.closest('.spec')?.querySelector('.spec-name')?.textContent, invalid: e.getAttribute('aria-invalid'), said: document.getElementById(e.getAttribute('aria-describedby') ?? '')?.textContent ?? e.closest('.value-field')?.querySelector('.error-msg')?.textContent }; });
  check('Fix opens that specification and puts the keyboard in the field concerned, marked with the problem\'s sentence', landed.role === 'combobox' && landed.label === 'IFC class' && landed.value === 'IFCRABBIT' && landed.spec === 'Rabbits are named' && /IFCRABBIT is not an IFC class in IFC4/.test(landed.said ?? ''), JSON.stringify(landed));
  await page.keyboard.type('wall');
  await page.locator('[role=option]').first().waitFor();
  const firstOption = await page.locator('[role=option]').first().innerText();
  await page.keyboard.press('Enter');
  await runVerdict.waitFor({ timeout: 60000 });
  check('typing the correction and choosing it from the pick-list makes the file valid, and the model is run', firstOption === 'Wall (IfcWall)' && (await word()) === 'Fail' && (await headline.innerText()) === '1 of 2 specifications passed.' && (await page.locator('.to-fix').count()) === 0, `${firstOption} | ${await headline.innerText()}`);

  // ---- edit, then automatic re-check and re-run; never a result of an older version ---------------
  await load(goodIds, goodIfc);
  await settled();
  await page.getByRole('button', { name: 'Edit Walls are named Waldo' }).click();
  check('a row being edited does not show its result as its state; the other parts of the result stay', (await specs.first().locator('.state').innerText()) === 'Editing' && (await specs.first().locator('.spec-counts').count()) === 0 && (await word()) === 'Pass');
  await resetRuns();
  workerDelay = 1500;
  const valueField = specs.first().getByRole('combobox', { name: 'Value', exact: true });
  await valueField.fill('Wilma');
  check('the sentence of the row follows the form as it is typed', (await specs.first().locator('.spec-words').innerText()).includes('set to "Wilma"'));
  check('after a change the previous result is gone at once and the page says it is checking again', (await runVerdict.count()) === 0 && (await word()) === 'Checking' && /Checking the IDS file again after your change/.test(await page.locator('.working').innerText()) && !(await pageText()).includes('The one specification passed.'));
  await valueField.fill('Wilm');
  await valueField.fill('Wilma');
  await runVerdict.waitFor({ timeout: 60000 });
  workerDelay = 0;
  check('the page checks and runs again by itself after the pause: the new result is of the changed file', /^0 of 1 specification passed\./.test(await headline.innerText()) && (await word()) === 'Fail' && /\(with unsaved changes\)/.test(await page.locator('.record').innerText()), await headline.innerText());
  check('typing three times in a row started one run, not three', (await runsStarted()) === 1, `runs started: ${await runsStarted()}`);
  // an edit while a run is in flight stops that run
  workerDelay = 2500;
  await resetRuns();
  await valueField.fill('Waldo');
  await page.locator('.working', { hasText: /model|specifications/ }).waitFor({ timeout: 10000 }).catch(() => {});
  await valueField.fill('Wilma again');
  await runVerdict.waitFor({ timeout: 60000 });
  workerDelay = 0;
  await page.waitForTimeout(3500);
  check('a change made while a run is in flight stops that run: only the result of the last version ever appears', /^0 of 1 specification passed\./.test(await headline.innerText()) && (await specs.first().locator('.spec-words').innerText()).includes('"Wilma again"'), await headline.innerText());
  const editedRep = (await downloadReport('report-edited.json')).json;
  check('the report says the IDS that was run holds unsaved changes', editedRep.edited === true && editedRep.run.verdict === 'fail');
  check('unsaved changes: the one primary action is Download .ids', (await page.locator('.btn.primary').allInnerTexts()).join(',') === 'Download .ids');

  // ---- an unedited file is checked and run on its own bytes -------------------------------
  // Written on one line with a comment: a rewritten copy would be on many lines and would have lost the comment.
  const oneLineIds = write('one-line.ids', `<?xml version="1.0" encoding="utf-8"?><!-- kept as it is --><ids xmlns="${NS}" ${SCHEMA_LOCATION} xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${spec('Rabbits', app(1, 'unbounded', 'IFCRABBIT'))}</specifications></ids>`);
  await load(oneLineIds, null);
  await checkSettled();
  const whereOpened = await findingRows.first().locator('.finding-where').innerText();
  await findingRows.first().locator('summary').click();
  const exOpened = await findingRows.first().locator('.excerpt').innerText();
  check('an unedited file: the finding is at the position in the file as opened (line 1), and the excerpt is the file\'s own text', /^line 1, column \d+$/.test(whereOpened) && exOpened.split('\n').filter((l) => /^[> ] *\d+ \|/.test(l)).length === 1 && exOpened.includes('<simpleValue>IFCRABBIT</simpleValue></name></entity></applicability></specification></specifications></ids>'), whereOpened);
  await page.getByRole('button', { name: 'Edit Rabbits' }).click();
  await specs.first().getByLabel('Name', { exact: true }).fill('Rabbits, renamed');
  await findingRows.first().locator('.finding-where').filter({ hasNotText: 'line 1,' }).waitFor({ timeout: 20000 });
  const whereEdited = await findingRows.first().locator('.finding-where').innerText();
  // Only the changed specification is written anew (on lines of its own); the rest of the line the file is written on stays as it is.
  if ((await findingRows.first().locator('.excerpt').count()) === 0) await findingRows.first().locator('summary').click();
  const exEdited = await findingRows.first().locator('.excerpt').innerText();
  const markedLine = exEdited.split('\n').find((l) => l.startsWith('>')) ?? '';
  check('once it is edited the position is in the file as it will be saved, and the record says so', /^line (?!1,)\d+, column \d+$/.test(whereEdited) && markedLine.includes('<simpleValue>IFCRABBIT</simpleValue>') && markedLine.startsWith(`> ${/^line (\d+)/.exec(whereEdited)[1]} |`) && /\(with unsaved changes\)/.test(await page.locator('.record').innerText()), `${whereEdited} | ${markedLine}`);
  await specs.first().getByLabel('Name', { exact: true }).fill('Rabbits');
  await findingRows.first().locator('.finding-where').filter({ hasText: 'line 1,' }).waitFor({ timeout: 20000 });
  check('taking the change back returns to the file as opened: line 1 again, no unsaved changes', !(await page.locator('#ids-status').innerText()).includes('unsaved changes') && !/unsaved/.test(await page.locator('.record').innerText()));
  // The run reads the opened File itself, not a copy: the page gives the worker the same bytes the browser gave the page.
  const bytesIds = write('bytes.ids', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(fs.readFileSync(goodIds, 'utf8').replace('<info>', '<!-- é -->\r\n<info>'))]));
  await fresh();
  // Every whole read of the IDS file, as text or as bytes (a slice of a File is a Blob, not a File, and is not counted).
  await page.evaluate(() => {
    const t = File.prototype.text, b = Blob.prototype.arrayBuffer; window.__read = [];
    const note = (f) => { if (f instanceof File && /\.ids$/.test(f.name)) window.__read.push(`${f.name}:${f.size}`); };
    File.prototype.text = function () { note(this); return t.call(this); };
    Blob.prototype.arrayBuffer = function () { note(this); return b.call(this); };
  });
  await setFiles(bytesIds, goodIfc);
  await settled();
  const read = await page.evaluate(() => window.__read);
  const size = fs.statSync(bytesIds).size;
  check('an unedited file is run from the opened file itself: every read is of that file at its own size, byte order mark and all', (await word()) === 'Pass' && read.length >= 2 && read.every((r) => r === `bytes.ids:${size}`), read.join(' '));

  // ---- reorder and delete with a result on screen ---------------------------------------
  await load(statesIds, goodIfc);
  await settled();
  await page.getByRole('button', { name: 'Edit Required, broken' }).click();
  await page.getByRole('button', { name: 'Move Required, broken up' }).click();
  await runVerdict.waitFor({ timeout: 60000 });
  const afterMove = await specs.evaluateAll((els) => els.slice(0, 2).map((e) => `${e.querySelector('.spec-name').textContent}=${e.querySelector('.state').textContent}`));
  check('moving a specification with a result on screen: the rows change place and the result is made again for the new order', afterMove.join(' | ') === 'Required, broken=Editing | Required, met=Pass' && /^4 of 8 specifications passed\./.test(await headline.innerText()), afterMove.join(' | '));
  await page.getByRole('button', { name: 'Delete Required, broken' }).click();
  await runVerdict.waitFor({ timeout: 60000 });
  await page.locator('.title-block .headline', { hasText: /of 7 specifications/ }).waitFor({ timeout: 60000 });
  check('deleting a specification with a result on screen: no dialog, the row goes, the result is made again for the seven left, and Undo is offered', (await specs.count()) === 7 && /^4 of 7 specifications passed\. 2 failed\./.test(await headline.innerText()) && dialogs.length === 0 && (await page.locator('.undo').innerText()).startsWith('Deleted "Required, broken".'), `${await headline.innerText()} | dialogs: ${dialogs.join(';')}`);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.locator('.title-block .headline', { hasText: /of 8 specifications/ }).waitFor({ timeout: 60000 });
  check('Undo puts the deleted specification back where it was', (await specs.count()) === 8 && (await specs.first().locator('.spec-name').innerText()) === 'Required, broken');
  dialogs.length = 0;

  // ---- a large IDS ---------------------------------------------------------------------
  const bigSpecs = write('large-2000.ids', execFileSync('node', ['scripts/make-large-ids.mjs', '2000', path.join(out, 'large-2000.ids')]) && fs.readFileSync(path.join(out, 'large-2000.ids')));
  await fresh();
  await page.evaluate(() => {
    window.__gaps = { max: 0 };
    let last = performance.now();
    setInterval(() => { const n = performance.now(); window.__gaps.max = Math.max(window.__gaps.max, n - last - 20); last = n; }, 20);
  });
  const tBig = Date.now();
  await idsInput.setInputFiles(bigSpecs);
  const sawWorking = await page.locator('.working').innerText({ timeout: 20000 }).then((t) => t === 'Checking the IDS file...').catch(() => false);
  await checkSettled();
  const bigSeconds = (Date.now() - tBig) / 1000;
  const blockedMs = await page.evaluate(() => window.__gaps.max);
  console.log(`LARGE IDS (2000 specifications, ${fs.statSync(bigSpecs).size} bytes): ${bigSeconds.toFixed(2)} s from choosing the file to the verdict; longest freeze of the page ${blockedMs.toFixed(0)} ms; "Checking the IDS file..." seen while it ran: ${sawWorking}`);
  check('large IDS (2,000 specifications): valid, every specification on the page, and the page stayed responsive (no freeze over 500 ms)', (await headline.innerText()) === 'This IDS file is valid.' && (await specs.count()) === 2000 && blockedMs < 500, `${bigSeconds.toFixed(2)} s, longest freeze ${blockedMs.toFixed(0)} ms`);

  // ---- storage ---------------------------------------------------------------------------
  await load(goodIds, null);
  await checkSettled();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Title').fill('Edited on the page');
  check('an opened file that is edited is unsaved, and the page heading follows the title', (await page.locator('#ids-status').innerText()).includes('unsaved changes') && (await page.locator('h2').innerText()) === 'Edited on the page');
  await new Promise((r) => setTimeout(r, 600));
  const store = await page.evaluate(async () => ({ session: Object.keys(sessionStorage), local: localStorage.length, idb: (await indexedDB.databases()).length, caches: (await caches.keys()).length, cookie: document.cookie }));
  check('storage holds only the sessionStorage draft', JSON.stringify(store.session) === '["idsbench.write.draft"]' && store.local === 0 && store.idb === 0 && store.caches === 0 && store.cookie === '', JSON.stringify(store));
  // opening another file over unsaved changes asks first; a file that is not an IDS file never replaces the document
  await idsInput.setInputFiles(path.join(out, 'text.ids'));
  await page.locator('.file-refusal .error').waitFor({ timeout: 60000 });
  check('a file that is not an IDS file is refused beside the document, which stays as it was, unsaved changes and all', (await page.getByLabel('Title').inputValue()) === 'Edited on the page' && (await page.locator('#ids-status').innerText()).includes('walls-named-waldo.ids') && dialogs.length === 0);
  await idsInput.setInputFiles(otherIds);
  await opened(otherIds);
  check('opening another IDS file over unsaved changes asks first', dialogs.length === 1 && /^confirm: You have unsaved changes\. Discard them\?$/.test(dialogs[0]) && !(await page.locator('#ids-status').innerText()).includes('unsaved'), dialogs.join(';'));
  dialogs.length = 0;
  // The engine has the last word on what is saved: an unknown class needs the IFC tables, which the form's own rules do not have.
  const unknownClass = write('unknown-class.ids', idsText(spec('Unknown class', app(1, 'unbounded', 'IFCWALLL'))));
  await load(unknownClass, null);
  await checkSettled();
  const gate = await page.locator('#ids-reason').innerText();
  check('an unknown IFC class: the engine\'s finding is on the page at its specification, and Download .ids is off with the engine\'s sentence', (await word()) === 'Not valid' && (await specs.first().locator('.finding-message').innerText()).includes('IFCWALLL') && (await page.getByRole('button', { name: 'Download .ids' }).isDisabled()) && /^Download is off until the IDS file is valid: .*IFCWALLL/.test(gate), gate);
  // A name one letter away from a real one is the engine's guess (IFCPILE for IFCPIPE): it is in the sentence, and it is not made one press.
  await page.locator('.to-fix[data-fixes="ready"]').waitFor({ timeout: 20000 });
  check('a name one letter away from a real one: the engine\'s suggestion is in the sentence, and no button applies the guess', (await page.locator('.fix-line .fix-text').innerText()).includes('Did you mean IFCWALL?') && (await page.locator('.fix-line .row-actions').innerText()).replace(/\s+/g, ' ') === 'Fix');
  const otherLetters = write('other-letters.ids', idsText(spec('Unknown class', app(1, 'unbounded', 'IfcWall'))));
  await load(otherLetters, null);
  await checkSettled();
  await page.getByRole('button', { name: 'Change it to IFCWALL' }).waitFor({ timeout: 20000 });
  check('...and the engine\'s own suggestion is offered as a one-press fix', (await page.locator('.fix-line .row-actions').innerText()).replace(/\s+/g, ' ') === 'Change it to IFCWALL Fix');
  await page.getByRole('button', { name: 'Change it to IFCWALL' }).click();
  await page.locator('.verdict.pass').waitFor({ timeout: 20000 });
  const fixedFile = await download('Download .ids', 'unknown-class-fixed.ids');
  check('after the fix the file is valid, Download .ids works, and the saved file is one the engine accepts', engine(fixedFile.path).valid === true && fixedFile.text.includes('<simpleValue>IFCWALL</simpleValue>') && !(await page.locator('#ids-status').innerText()).includes('unsaved'));

  // ---- scale ------------------------------------------------------------------
  await fresh();
  let seconds = 0;
  const mem = await withPeakMemory(async () => {
    const t0 = Date.now();
    await setFiles(bigIds, bigIfc);
    await settled();
    seconds = (Date.now() - t0) / 1000;
  });
  const hb = await headline.innerText().catch(() => '');
  console.log(`SCALE ${WALLS} walls, ${fs.statSync(bigIfc).size} bytes: ${seconds.toFixed(1)} s from choosing the files to the result; browser memory (all Chromium processes, resident) ${mem.before.toFixed(0)} MB before, ${mem.peak.toFixed(0)} MB peak`);
  check('scale: every wall fails one specification', /^0 of 1 specification passed\./.test(hb) && (await pageText()).includes(`Applied to ${WALLS.toLocaleString('en')} elements: 0 passed, ${WALLS.toLocaleString('en')} failed.`), hb);
  await page.locator('details.fails > summary').first().click();
  check('scale: the page lists 200 rows', (await page.locator('.spec tbody tr').count()) === 200);
  const more = await page.locator('details.fails .note').last().innerText();
  check('scale: the page says how many are not shown and where they are', more === `The first 200 failing elements are listed here. ${(WALLS - 200).toLocaleString('en')} more are not shown on this page. The downloaded files list all ${WALLS.toLocaleString('en')}.`, more);
  check('scale: the group says the full count, not the number listed', (await page.locator('.group-reason').first().innerText()).startsWith(`${WALLS.toLocaleString('en')} elements: `));
  const t1 = Date.now();
  const repBig = await downloadReport('report-big.json');
  const ids = new Set(repBig.json.run.specs[0].failures.map((f) => f.globalId));
  console.log(`SCALE report: ${repBig.bytes} bytes, written in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  check('scale: the downloaded report holds every failing element', repBig.json.run.specs[0].failures.length === WALLS && ids.size === WALLS && repBig.json.run.specs[0].failed === WALLS, `${repBig.json.run.specs[0].failures.length} of ${WALLS}`);
  check('scale: reasons are readable', /^The property "FireRating" is missing: the property set "Pset_WallCommon" is not on this element/.test(repBig.json.run.specs[0].failures[0].reasons.join(' ')), repBig.json.run.specs[0].failures[0].reasons.join(' '));
  const csvBig = await download('Download failing elements', 'failing-big.csv');
  check('scale: the CSV holds every failing element, not only the 200 on the page', csvBig.text.split('\r\n').length === WALLS + 2 && new Set(csvBig.text.split('\r\n').slice(1, -1).map((l) => l.split(',').at(-4))).size === WALLS, `${csvBig.text.split('\r\n').length - 2} rows, ${csvBig.bytes} bytes`);

  // ---- offline and privacy ----------------------------------------------------
  const stored = await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    idb: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
    sw: (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0,
  }));
  check('nothing stored when nothing is unsaved: localStorage, sessionStorage, cookies, indexedDB, caches, service workers', stored.local === 0 && stored.session === 0 && stored.cookie === '' && stored.idb === 0 && stored.caches === 0 && stored.sw === 0, JSON.stringify(stored));
  check('no cookies in the browser context', (await ctx.cookies()).length === 0);
  await collectStale();
  const seen = await page.evaluate(() => window.__seen);
  check('at no moment of this whole script did the page show a result made for another version of the document', stale.length === 0 && seen > 0, stale.slice(0, 3).join(' | ') || `changes of the page watched on the last page alone: ${seen}`);
  check('no request to anywhere but the local server', blocked.length === 0, `blocked=${JSON.stringify(blocked)} local=${local.length}`);
  check('no uncaught page errors', expectedPageErrors.length === 0 && pageErrors.length === 0, [...expectedPageErrors, ...pageErrors].join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`assertions passed: ${passed}, failed: ${failed}, total: ${passed + failed}`);
process.exit(failed ? 1 : 0);
