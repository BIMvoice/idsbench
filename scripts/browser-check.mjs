// Serves dist/ from a tiny static server on a free local port, drives it with
// headless Chromium, and blocks every request that is not to that server.
// Usage: node scripts/browser-check.mjs <TestCases dir> [walls]
//   <TestCases dir>  Documentation/ImplementersDocumentation/TestCases of buildingSMART/IDS
//   [walls]          size of the generated model for the scale check (default 20000)
// Files it generates and downloads go to .scratch/browser-check/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.argv[2];
if (!root) throw new Error('usage: browser-check.mjs <TestCases dir> [walls]');
const cases = path.join(root, 'ids');
const WALLS = Number(process.argv[3] ?? 20000);
const dist = path.resolve('dist');
const out = path.resolve('.scratch/browser-check');
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };
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
const spec = (name, applicability, req = '', version = 'IFC4') => `<specification name="${name}" ifcVersion="${version}">${applicability}${req}</specification>`;
const app = (min, max, cls) => `<applicability minOccurs="${min}" maxOccurs="${max}">${entity(cls)}</applicability>`;
const idsText = (specs, rootAttrs = `xmlns="${NS}"`) => `<?xml version="1.0" encoding="utf-8"?>\n<ids ${rootAttrs} xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;

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
  spec('No applicability', '<applicability minOccurs="0" maxOccurs="unbounded"/>', nameIs('Waldo')) +
  spec('Written for IFC2X3', app(0, 'unbounded', 'IFCWALL'), nameIs('Waldo'), 'IFC2X3'),
));
const uncheckedIds = write('one-unchecked.ids', idsText(
  spec('Required, met', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo')) +
  spec('No applicability', '<applicability minOccurs="0" maxOccurs="unbounded"/>', nameIs('Waldo')),
));
const bigIfc = write(`walls-${WALLS}.ifc`, ifcText('IFC4', Array.from({ length: WALLS }, (_, i) => wall(i + 1, `Wall ${i + 1}`)).join('')));
const bigIds = write('walls-need-fire-rating.ids', idsText(spec(
  'Walls have a fire rating', app(1, 'unbounded', 'IFCWALL'),
  '<requirements><property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property></requirements>',
)));

/** [label, ids file, ifc file, pattern the message must match] */
const refusals = [
  ['IFC with a valid header and a cut-off body', goodIds, write('cut-off.ifc', twoWalls.slice(0, twoWalls.indexOf('#2=') + 20)), /cut off/],
  ['zipped IFC named .ifc', goodIds, write('zipped.ifc', Buffer.concat([Buffer.from('PK\u0003\u0004\u0014\0\0\0\0\0a.ifc', 'latin1'), Buffer.from(twoWalls)])), /zipped.*Unzip/],
  ['ifcXML named .ifc', goodIds, write('xml.ifc', '<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2"><IfcWall id="i1"/></ifcXML>'), /XML format.*Export the model as \.ifc/],
  ['empty IFC file', goodIds, write('empty.ifc', ''), /IFC file is empty/],
  ['IFC with a header and no data', goodIds, write('no-data.ifc', ifcText('IFC4', '')), /no model data/],
  ['IFC2X2 model', goodIds, write('ifc2x2.ifc', ifcText('IFC2X2_FINAL', wall(1))), /This model is IFC2X2_FINAL\. IDS covers IFC2X3, IFC4 and IFC4X3 only/],
  ['text file named .ifc', goodIds, write('text.ifc', 'this is not a model'), /not an IFC model that idsbench can read/],
  ['IDS file in the IFC box', goodIds, goodIds, /This is an IDS file, not an IFC model\. Put the IDS file in the IDS box/],
  ['IFC model in the IDS box', goodIfc, goodIfc, /This is an IFC model, not an IDS file\. Put the IDS file in the IDS box/],
  ['both files in the wrong boxes', goodIfc, goodIds, /This is an IFC model, not an IDS file/],
  ['IDS that is not XML', write('text.ids', 'this is not xml'), goodIfc, /could not be read as an IDS file/],
  ['IDS cut off', write('cut-off.ids', fs.readFileSync(goodIds, 'utf8').slice(0, -90)), goodIfc, /could not be (read|used) as an IDS file/],
  ['empty IDS file', write('empty.ids', ''), goodIfc, /IDS file is empty/],
  ['IDS with the wrong namespace', write('wrong-namespace.ids', idsText(spec('s', app(1, 'unbounded', 'IFCWALL')), 'xmlns="http://example.com/not-ids"')), goodIfc, /does not identify itself as a buildingSMART IDS file/],
  ['IDS with no specifications', write('no-specifications.ids', idsText('')), goodIfc, /contains no specifications.*Add at least one/],
  ['IDS 0.9.7 draft', write('draft.ids', idsText(spec('s', app(1, 'unbounded', 'IFCWALL')), `xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/0.9.7/ids.xsd"`)), goodIfc, /written for IDS 0\.9\.7.*Save the file as IDS 1\.0/],
  ['HTML page named .ids', write('page.ids', '<html><body>hello</body></html>'), goodIfc, /could not be used as an IDS file/],
];

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
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    // Hold the worker script back so a check is reliably still in progress
    // when the test acts. The request itself stays local.
    if (workerDelay && /\/assets\/worker-/.test(u)) await new Promise((r) => setTimeout(r, workerDelay));
    if (breakWorker && /\/assets\/worker-/.test(u)) {
      return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("simulated crash at start");' });
    }
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) { local.push(u); return route.continue(); }
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  let workersStarted = 0;
  // The IFC parser starts a helper worker of its own from a blob: URL; only the app's worker is counted.
  page.on('worker', (w) => { if (w.url().includes('/assets/worker-')) workersStarted++; });

  const runButton = page.locator('button.primary');
  const setFiles = async (idsFile, ifcFile) => {
    if (idsFile) await page.locator('input[type=file]').nth(0).setInputFiles(idsFile);
    if (ifcFile) await page.locator('input[type=file]').nth(1).setInputFiles(ifcFile);
  };
  const load = async (idsFile, ifcFile) => {
    await page.goto(origin + '/');
    await setFiles(idsFile, ifcFile);
    await runButton.click();
  };
  const settled = () => page.locator('.headline, .error').first().waitFor({ timeout: 120000 });
  const pageText = () => page.locator('main').innerText();
  const downloadReport = async (name) => {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download report' }).click();
    const d = await dl;
    const p = path.join(out, name);
    await d.saveAs(p);
    return { json: JSON.parse(fs.readFileSync(p, 'utf8')), file: d.suggestedFilename(), bytes: fs.statSync(p).size };
  };

  // ---- tabs -----------------------------------------------------------------
  await page.goto(origin + '/');
  check('three tabs present', (await page.getByRole('tab').allTextContents()).join(',') === 'Write,Check,Run');
  await page.getByRole('tab', { name: 'Write' }).click();
  check('Write says not built yet', (await page.locator('#panel-write').innerText()).includes('Not built yet'));
  await page.getByRole('tab', { name: 'Check' }).click();
  check('Check says not built yet', (await page.locator('#panel-check').innerText()).includes('Not built yet'));
  await page.getByRole('tab', { name: 'Run' }).click();
  check('Run disabled with no files', await runButton.isDisabled());
  check('a live region for announcements exists before any run, and is empty', (await page.locator('[aria-live=polite]').count()) === 1 && (await page.locator('[aria-live=polite]').innerText()).trim() === '');

  // ---- official pass pair -----------------------------------------------------
  const pass = 'pass-a_minimal_ids_can_check_a_minimal_ifc_2_2';
  await load(path.join(cases, pass + '.ids'), path.join(cases, pass + '.ifc'));
  await settled();
  const h1 = await page.locator('.headline').innerText();
  check('pass pair headline', h1 === 'The one specification passed.', h1);
  check('pass pair row state Pass', (await page.locator('.spec .state').first().innerText()).includes('Pass'));
  check('file names and sizes shown in the boxes', (await page.locator('.drop-detail').first().innerText()).includes(pass + '.ids'));
  check('result names both files', (await page.locator('.meta').first().innerText()).includes(pass + '.ids') && (await page.locator('.meta').first().innerText()).includes(pass + '.ifc'));
  check('result says Run does not verify the IDS file itself', (await page.locator('.notice').innerText()).includes('It does not check that the IDS file itself is valid.'));
  check('headline sits inside the live region', (await page.locator('[aria-live=polite] .headline').count()) === 1);
  const rep1 = await downloadReport('report-pass.json');
  check('report download is JSON with specs', Array.isArray(rep1.json.specs) && rep1.json.specs.length === 1 && rep1.json.verdict === 'pass', rep1.file);

  // ---- official fail pair -----------------------------------------------------
  const fail = 'fail-a_minimal_ids_can_check_a_minimal_ifc_1_2';
  await load(path.join(cases, fail + '.ids'), path.join(cases, fail + '.ifc'));
  await settled();
  const h2 = await page.locator('.headline').innerText();
  check('fail pair headline', /^0 of 1 specification passed\./.test(h2), h2);
  check('fail pair row state Fail', (await page.locator('.spec .state').first().innerText()).includes('Fail'));
  await page.locator('summary.spec-head').first().click();
  const rows = await page.locator('.spec tbody tr').count();
  check('failing element listed', rows >= 1, `${rows} row(s): ${await page.locator('.spec tbody tr').first().innerText()}`);

  // ---- ifcVersion: checked anyway, with a note --------------------------------
  const meta = 'pass-specification_version_is_purely_metadata_and_does_not_impact_pass_or_fail_result';
  await load(path.join(cases, meta + '.ids'), path.join(cases, meta + '.ifc'));
  await settled();
  check('IFC2X3 specification on an IFC4 model is checked and passes', (await page.locator('.headline').innerText()) === 'The one specification passed.' && (await page.locator('.error').count()) === 0);
  const sn = await page.locator('.spec .schema-note').innerText().catch(() => '');
  check('the row says the model version is not one the specification lists', /The model is IFC4, but this specification lists IFC2X3\. It was checked anyway/.test(sn), sn);
  const req22 = 'fail-required_specifications_need_at_least_one_applicable_entity_2_2';
  await load(path.join(cases, req22 + '.ids'), path.join(cases, req22 + '.ifc'));
  await settled();
  check('IFC2X3 specification that fails on an IFC4 model fails for its own reason', /^0 of 1/.test(await page.locator('.headline').innerText()) && /needs at least one matching element/.test(await pageText()));

  // ---- every state on one page ------------------------------------------------
  await load(statesIds, goodIfc);
  await settled();
  const states = await page.locator('.spec').evaluateAll((els) => els.map((e) => ({
    name: e.querySelector('.spec-name').textContent, state: e.querySelector('.state').textContent.trim(), counts: e.querySelector('.spec-counts').textContent, notes: [...e.querySelectorAll(':scope > .note')].map((n) => n.textContent).join(' '),
  })));
  const st = Object.fromEntries(states.map((s) => [s.name, s]));
  console.log('STATE TABLE (as shown on the page)');
  for (const s of states) console.log(`   ${s.name} | ${s.state} | ${s.counts} | ${s.notes}`);
  const hs = await page.locator('.headline').innerText();
  console.log(`   headline: ${hs}`);
  check('states headline counts passed, failed and unchecked separately', hs === '4 of 8 specifications passed. 3 failed. 1 could not be checked. 1 optional specification matched nothing in this model, so there was nothing to check there.', hs);
  check('states headline is styled as a failure', (await page.locator('.headline').getAttribute('class')).includes('fail'));
  check('required and met shows Pass', st['Required, met'].state.includes('Pass') && st['Required, met'].counts.startsWith('Applied to 2 elements: 2 passed, 0 failed.'));
  check('required and broken shows Fail with counts', st['Required, broken'].state.includes('Fail') && st['Required, broken'].counts.startsWith('Applied to 2 elements: 0 passed, 2 failed.'));
  check('required with nothing matching shows Fail and why', st['Required, nothing matches'].state.includes('Fail') && /needs at least one matching element/.test(st['Required, nothing matches'].notes));
  check('optional with nothing matching shows Nothing to check', st['Optional, nothing matches'].state.includes('Nothing to check'));
  check('prohibited and none found shows Pass', st['Prohibited, none found'].state.includes('Pass') && st['Prohibited, none found'].counts.startsWith('None found in the model'));
  check('prohibited and found shows Fail and never "2 passed"', st['Prohibited, found'].state.includes('Fail') && st['Prohibited, found'].counts.startsWith('Found 2 elements that must not be in the model.') && !/2 passed/.test(st['Prohibited, found'].counts));
  check('no applicability shows Not checked and what to do', st['No applicability'].state.includes('Not checked') && /Add an applicability/.test(st['No applicability'].notes));
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
  const prohibitedRow = page.locator('.spec', { hasText: 'Prohibited, found' });
  await prohibitedRow.locator('summary').click();
  check('prohibited and found lists the elements that must not be there', (await prohibitedRow.locator('tbody tr').count()) === 2 && /must not be in the model/.test(await prohibitedRow.locator('tbody tr').first().innerText()));
  check('no jargon in the states page', !JARGON.test(await pageText()), (await pageText()).match(JARGON)?.[0] ?? '');
  await page.screenshot({ path: path.join(out, 'shot-states.png'), fullPage: true });

  await load(uncheckedIds, goodIfc);
  await settled();
  const hu = await page.locator('.headline').innerText();
  check('one pass and one unchecked is not "all passed"', hu === '1 of 2 specifications passed. 1 could not be checked.' && (await page.locator('.headline').getAttribute('class')).includes('incomplete'), hu);

  // ---- inputs that lie --------------------------------------------------------
  for (const [label, idsFile, ifcFile, pattern] of refusals) {
    await load(idsFile, ifcFile);
    await settled();
    const msg = await page.locator('.error').innerText().catch(() => '');
    const noVerdict = (await page.locator('.headline').count()) === 0 && (await page.locator('.spec').count()) === 0;
    check(`${label}: plain sentence, no verdict`, pattern.test(msg) && noVerdict && !JARGON.test(msg) && !/0 of 0/.test(await pageText()), msg || '(no message; a result was shown)');
  }
  const bom = write('bom.ifc', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(twoWalls)]));
  await load(goodIds, bom);
  await settled();
  check('IFC with a UTF-8 byte order mark is checked', (await page.locator('.headline').innerText().catch(() => '')) === 'The one specification passed.');
  const oneLine = write('one-line.ifc', ifcText('IFC4', Array.from({ length: 3000 }, (_, i) => wall(i + 1)).join('')).replace(/\n/g, ''));
  await load(goodIds, oneLine);
  await settled();
  check('IFC written as one long line is checked, all 3,000 walls', (await pageText()).includes('Applied to 3,000 elements: 3,000 passed, 0 failed.'));

  // ---- the worker -------------------------------------------------------------
  // A second pair after a first: the old result goes the moment a file changes.
  await load(goodIds, goodIfc);
  await settled();
  check('first pair passes', (await page.locator('.headline').innerText()) === 'The one specification passed.');
  await setFiles(otherIds, null);
  check('choosing another file removes the previous result at once', (await page.locator('.headline').count()) === 0 && (await page.locator('.spec').count()) === 0 && (await page.getByRole('button', { name: 'Download report' }).count()) === 0);
  await runButton.click();
  await settled();
  const second = await pageText();
  check('second pair shows its own result under its own names', /^0 of 1/.test(await page.locator('.headline').innerText()) && second.includes('Walls are named Wilma') && /IDS file\s+walls-named-wilma\.ids/.test(second) && !second.includes('Walls are named Waldo'));

  // Changing a file while a run is in progress: the run must not deliver.
  await page.goto(origin + '/');
  await setFiles(bigIds, bigIfc);
  workersStarted = 0;
  workerDelay = 3000;
  await runButton.dblclick();
  check('Run is disabled while a check is in progress', await runButton.isDisabled() && (await runButton.innerText()) === 'Working...');
  await page.locator('.working').waitFor({ timeout: 10000 });
  await setFiles(goodIds, null);
  check('changing a file during a run stops it: no progress text, Run available again', (await page.locator('.working').count()) === 0 && !(await runButton.isDisabled()));
  workerDelay = 0;
  await page.waitForTimeout(8000);
  check('the stopped run never shows a result under the new file name', (await page.locator('.headline').count()) === 0 && (await page.locator('.spec').count()) === 0);
  await setFiles(null, goodIfc);
  await runButton.click();
  await settled();
  check('a run after a stopped run gives the new pair its own result', (await page.locator('.headline').innerText()) === 'The one specification passed.' && /Model\s+two-walls\.ifc/.test(await pageText()));

  // Run clicked twice in quick succession.
  await page.goto(origin + '/');
  await setFiles(goodIds, goodIfc);
  workersStarted = 0;
  await runButton.dblclick();
  await settled();
  await page.waitForTimeout(500);
  check('clicking Run twice starts one check, not two', workersStarted === 1 && (await page.locator('.headline').count()) === 1, `workers started: ${workersStarted}`);

  // The worker fails to start or crashes.
  breakWorker = true;
  await load(goodIds, goodIfc);
  await settled();
  const crash = await page.locator('.error').innerText().catch(() => '');
  check('a crashed worker gives a plain sentence and no result', /did not finish, so there is no result/.test(crash) && !JARGON.test(crash) && (await page.locator('.headline').count()) === 0 && !(await runButton.isDisabled()), crash);
  breakWorker = false;
  await runButton.click();
  await page.locator('.headline').waitFor({ timeout: 60000 });
  check('Run works again after a crash', (await page.locator('.headline').innerText()) === 'The one specification passed.' && (await page.locator('.error').count()) === 0);
  const expectedPageErrors = pageErrors.splice(0).filter((e) => !/simulated crash at start/.test(e));

  // ---- keyboard only ----------------------------------------------------------
  await page.goto(origin + '/');
  const focused = () => page.evaluate(() => { const e = document.activeElement; return `${e.getAttribute('role') ?? e.tagName.toLowerCase()}:${(e.getAttribute('aria-labelledby') ? document.getElementById(e.getAttribute('aria-labelledby')).textContent : e.textContent).trim().slice(0, 40)}`; });
  await page.keyboard.press('Tab');
  const f1 = await focused();
  await page.keyboard.press('Tab');
  const f2 = await focused();
  const chooser1 = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Enter');
  await (await chooser1).setFiles(statesIds);
  await page.keyboard.press('Tab');
  const f3 = await focused();
  const chooser2 = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Space');
  await (await chooser2).setFiles(goodIfc);
  await page.keyboard.press('Tab');
  const f4 = await focused();
  check('Tab order: tabs, IDS box, IFC box, Run', f1 === 'tab:Run' && f2 === 'button:IDS file (.ids)' && f3 === 'button:IFC model (.ifc)' && f4 === 'button:Run', [f1, f2, f3, f4].join(' > '));
  check('both boxes take a file with Enter or Space', (await page.locator('.drop-detail').nth(0).innerText()).includes('states.ids') && (await page.locator('.drop-detail').nth(1).innerText()).includes('two-walls.ifc'));
  await page.keyboard.press('Enter');
  await settled();
  await page.keyboard.press('Tab');
  const f5 = await focused();
  await page.keyboard.press('Tab');
  const firstRow = await page.evaluate(() => document.activeElement.tagName.toLowerCase() + ':' + (document.activeElement.querySelector('.spec-name')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  const opened = await page.evaluate(() => document.activeElement.parentElement.open);
  await page.keyboard.press('Space');
  const closed = await page.evaluate(() => !document.activeElement.parentElement.open);
  await page.keyboard.press('Tab');
  const nextRow = await page.evaluate(() => document.activeElement.querySelector('.spec-name')?.textContent ?? '');
  check('after Run: Download report, then each row that has elements to show', f5 === 'button:Download report' && firstRow === 'summary:Required, broken' && nextRow === 'Prohibited, found', [f5, firstRow, nextRow].join(' > '));
  check('a row opens and closes from the keyboard', opened && closed);
  check('focus is visible on the focused row', await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));

  // ---- scale ------------------------------------------------------------------
  await page.goto(origin + '/');
  await setFiles(bigIds, bigIfc);
  let seconds = 0;
  const mem = await withPeakMemory(async () => {
    const t0 = Date.now();
    await runButton.click();
    await settled();
    seconds = (Date.now() - t0) / 1000;
  });
  const hb = await page.locator('.headline').innerText().catch(() => '');
  console.log(`SCALE ${WALLS} walls, ${fs.statSync(bigIfc).size} bytes: ${seconds.toFixed(1)} s from Run to result; browser memory (all Chromium processes, resident) ${mem.before.toFixed(0)} MB before, ${mem.peak.toFixed(0)} MB peak`);
  check('scale: every wall fails one specification', /^0 of 1 specification passed\./.test(hb) && (await pageText()).includes(`Applied to ${WALLS.toLocaleString('en')} elements: 0 passed, ${WALLS.toLocaleString('en')} failed.`), hb);
  await page.locator('summary.spec-head').first().click();
  check('scale: the page lists 200 rows', (await page.locator('.spec tbody tr').count()) === 200);
  const more = await page.locator('details .note').last().innerText();
  check('scale: the page says how many are not shown and where they are', more === `The first 200 failing elements are listed here. ${(WALLS - 200).toLocaleString('en')} more are not shown on this page. The downloaded report lists all ${WALLS.toLocaleString('en')}.`, more);
  const t1 = Date.now();
  const repBig = await downloadReport('report-big.json');
  const ids = new Set(repBig.json.specs[0].failures.map((f) => f.globalId));
  console.log(`SCALE report: ${repBig.bytes} bytes, written in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  check('scale: the downloaded report holds every failing element', repBig.json.specs[0].failures.length === WALLS && ids.size === WALLS && repBig.json.specs[0].failed === WALLS, `${repBig.json.specs[0].failures.length} of ${WALLS}`);
  check('scale: reasons are readable', /^Property set "Pset_WallCommon" not found/.test(repBig.json.specs[0].failures[0].reasons.join(' ')), repBig.json.specs[0].failures[0].reasons.join(' '));

  // ---- offline and privacy ----------------------------------------------------
  const stored = await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    idb: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
    sw: (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0,
  }));
  check('nothing stored: localStorage, sessionStorage, cookies, indexedDB, caches, service workers', stored.local === 0 && stored.session === 0 && stored.cookie === '' && stored.idb === 0 && stored.caches === 0 && stored.sw === 0, JSON.stringify(stored));
  check('no cookies in the browser context', (await ctx.cookies()).length === 0);
  check('no request to anywhere but the local server', blocked.length === 0, `blocked=${JSON.stringify(blocked)} local=${local.length}`);
  check('no uncaught page errors', expectedPageErrors.length === 0 && pageErrors.length === 0, [...expectedPageErrors, ...pageErrors].join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`assertions passed: ${passed}, failed: ${failed}, total: ${passed + failed}`);
process.exit(failed ? 1 : 0);
