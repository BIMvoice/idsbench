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
  ['IDS that is not XML', write('text.ids', 'this is not xml'), goodIfc, /This file is not XML, so it is not an IDS file\. Check that you chose the right file/],
  ['IDS cut off', write('cut-off.ids', fs.readFileSync(goodIds, 'utf8').slice(0, -90)), goodIfc, /^This IDS file has 1 problem, so the result could not be trusted\.$/],
  ['empty IDS file', write('empty.ids', ''), goodIfc, /IDS file is empty/],
  ['IDS with the wrong namespace', write('wrong-namespace.ids', idsText(spec('s', app(1, 'unbounded', 'IFCWALL')), 'xmlns="http://example.com/not-ids"')), goodIfc, /^This IDS file has 1 problem, so the result could not be trusted\.$/],
  ['IDS with no specifications', write('no-specifications.ids', idsText('')), goodIfc, /^This IDS file has 1 problem, so the result could not be trusted\.$/],
  ['IDS 0.9.7 (refused: idsbench reads IDS 1.0 only)', write('draft.ids', idsText(spec('s', app(1, 'unbounded', 'IFCWALL')), `xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/0.9.7/ids.xsd"`)), goodIfc, /^This IDS file has 1 problem, so the result could not be trusted\.$/],
  ['HTML page named .ids', write('page.ids', '<html><body>hello</body></html>'), goodIfc, /This is an XML file but not an IDS file: it starts with <html>, not <ids>/],
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
  let slowEngine = 0;
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    // Hold the worker script back so a check is reliably still in progress
    // when the test acts. The request itself stays local.
    if (workerDelay && /\/assets\/worker-/.test(u)) await new Promise((r) => setTimeout(r, workerDelay));
    if (slowEngine && /\/assets\/xmllint-browser/.test(u)) await new Promise((r) => setTimeout(r, slowEngine));
    if (breakWorker && /\/assets\/worker-/.test(u)) {
      return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("simulated crash at start");' });
    }
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) { local.push(u); return route.continue(); }
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const run = page.locator('#panel-run');
  const checkPanel = page.locator('#panel-check');
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  let workersStarted = 0;
  // The IFC parser starts a helper worker of its own from a blob: URL; only the app's worker is counted.
  page.on('worker', (w) => { if (w.url().includes('/assets/worker-')) workersStarted++; });

  const runButton = run.locator('button.primary');
  const setFiles = async (idsFile, ifcFile) => {
    if (idsFile) await run.locator('input[type=file]').nth(0).setInputFiles(idsFile);
    if (ifcFile) await run.locator('input[type=file]').nth(1).setInputFiles(ifcFile);
  };
  const load = async (idsFile, ifcFile) => {
    await page.goto(origin + '/');
    await setFiles(idsFile, ifcFile);
    await runButton.click();
  };
  const settled = () => run.locator('.headline, .error').first().waitFor({ timeout: 120000 });
  const pageText = () => run.innerText();
  const downloadReport = async (name) => {
    const dl = page.waitForEvent('download');
    await run.getByRole('button', { name: 'Download report' }).click();
    const d = await dl;
    const p = path.join(out, name);
    await d.saveAs(p);
    return { json: JSON.parse(fs.readFileSync(p, 'utf8')), file: d.suggestedFilename(), bytes: fs.statSync(p).size };
  };

  // ---- tabs -----------------------------------------------------------------
  await page.goto(origin + '/');
  check('three tabs present', (await page.getByRole('tab').allTextContents()).join(',') === 'Write,Check,Run');
  await page.getByRole('tab', { name: 'Write' }).click();
  check('Write opens an editor (its own check is scripts/write-check.mjs)', (await page.locator('#panel-write').innerText()).includes('About this IDS'));
  await page.getByRole('tab', { name: 'Check' }).click();
  check('Check tab has its drop zone and no longer says it is not built', (await checkPanel.getByRole('button', { name: 'IDS file (.ids)' }).count()) === 1 && !(await checkPanel.innerText()).includes('Not built yet'));
  await page.getByRole('tab', { name: 'Run' }).click();
  check('Run disabled with no files', await runButton.isDisabled());
  check('a live region for announcements exists before any run, and is empty', (await run.locator('[aria-live=polite]').count()) === 1 && (await run.locator('[aria-live=polite]').innerText()).trim() === '');

  // ---- official pass pair -----------------------------------------------------
  const pass = 'pass-a_minimal_ids_can_check_a_minimal_ifc_2_2';
  await load(path.join(cases, pass + '.ids'), path.join(cases, pass + '.ifc'));
  await settled();
  const h1 = await run.locator('.headline').innerText();
  check('pass pair headline', h1 === 'The one specification passed.', h1);
  check('pass pair row state Pass', (await run.locator('.spec .state').first().innerText()).includes('Pass'));
  check('file names and sizes shown in the boxes', (await run.locator('.drop-detail').first().innerText()).includes(pass + '.ids'));
  check('result names both files', (await run.locator('.results .meta').first().innerText()).includes(pass + '.ids') && (await run.locator('.results .meta').first().innerText()).includes(pass + '.ifc'));
  check('result says the IDS file was checked first and is valid, and no longer says it was not verified', (await run.locator('.results').locator('xpath=preceding-sibling::p[1]').innerText()) === 'The IDS file was checked first and is valid.' && !(await pageText()).includes('does not check that the IDS file itself'));
  check('headline sits inside the live region', (await run.locator('[aria-live=polite] .headline').count()) === 1);
  const rep1 = await downloadReport('report-pass.json');
  check('report download is JSON with specs', Array.isArray(rep1.json.specs) && rep1.json.specs.length === 1 && rep1.json.verdict === 'pass', rep1.file);

  // ---- official fail pair -----------------------------------------------------
  const fail = 'fail-a_minimal_ids_can_check_a_minimal_ifc_1_2';
  await load(path.join(cases, fail + '.ids'), path.join(cases, fail + '.ifc'));
  await settled();
  const h2 = await run.locator('.headline').innerText();
  check('fail pair headline', /^0 of 1 specification passed\./.test(h2), h2);
  check('fail pair row state Fail', (await run.locator('.spec .state').first().innerText()).includes('Fail'));
  await run.locator('summary.spec-head').first().click();
  const rows = await run.locator('.spec tbody tr').count();
  check('failing element listed', rows >= 1, `${rows} row(s): ${await run.locator('.spec tbody tr').first().innerText()}`);

  // ---- ifcVersion: checked anyway, with a note --------------------------------
  const meta = 'pass-specification_version_is_purely_metadata_and_does_not_impact_pass_or_fail_result';
  await load(path.join(cases, meta + '.ids'), path.join(cases, meta + '.ifc'));
  await settled();
  check('IFC2X3 specification on an IFC4 model is checked and passes', (await run.locator('.headline').innerText()) === 'The one specification passed.' && (await run.locator('.error').count()) === 0);
  const sn = await run.locator('.spec .schema-note').innerText().catch(() => '');
  check('the row says the model version is not one the specification lists', /The model is IFC4, but this specification lists IFC2X3\. It was checked anyway/.test(sn), sn);
  const req22 = 'fail-required_specifications_need_at_least_one_applicable_entity_2_2';
  await load(path.join(cases, req22 + '.ids'), path.join(cases, req22 + '.ifc'));
  await settled();
  check('IFC2X3 specification that fails on an IFC4 model fails for its own reason', /^0 of 1/.test(await run.locator('.headline').innerText()) && /needs at least one matching element/.test(await pageText()));

  // ---- every state on one page ------------------------------------------------
  await load(statesIds, goodIfc);
  await settled();
  const states = await run.locator('.spec').evaluateAll((els) => els.map((e) => ({
    name: e.querySelector('.spec-name').textContent, state: e.querySelector('.state').textContent.trim(), counts: e.querySelector('.spec-counts').textContent, notes: [...e.querySelectorAll(':scope > .note')].map((n) => n.textContent).join(' '),
  })));
  const st = Object.fromEntries(states.map((s) => [s.name, s]));
  console.log('STATE TABLE (as shown on the page)');
  for (const s of states) console.log(`   ${s.name} | ${s.state} | ${s.counts} | ${s.notes}`);
  const hs = await run.locator('.headline').innerText();
  console.log(`   headline: ${hs}`);
  check('states headline counts passed, failed and unchecked separately', hs === '4 of 8 specifications passed. 3 failed. 1 could not be checked. 1 optional specification matched nothing in this model, so there was nothing to check there.', hs);
  check('states headline is styled as a failure', (await run.locator('.headline').getAttribute('class')).includes('fail'));
  check('required and met shows Pass', st['Required, met'].state.includes('Pass') && st['Required, met'].counts.startsWith('Applied to 2 elements: 2 passed, 0 failed.'));
  check('required and broken shows Fail with counts', st['Required, broken'].state.includes('Fail') && st['Required, broken'].counts.startsWith('Applied to 2 elements: 0 passed, 2 failed.'));
  check('required with nothing matching shows Fail and why', st['Required, nothing matches'].state.includes('Fail') && /needs at least one matching element/.test(st['Required, nothing matches'].notes));
  check('optional with nothing matching shows Nothing to check', st['Optional, nothing matches'].state.includes('Nothing to check'));
  check('prohibited and none found shows Pass', st['Prohibited, none found'].state.includes('Pass') && st['Prohibited, none found'].counts.startsWith('None found in the model'));
  check('prohibited and found shows Fail and never "2 passed"', st['Prohibited, found'].state.includes('Fail') && st['Prohibited, found'].counts.startsWith('Found 2 elements that must not be in the model.') && !/2 passed/.test(st['Prohibited, found'].counts));
  check('an unsafe pattern shows Not checked and what to do', st['Unsafe pattern'].state.includes('Not checked') && /Simplify the pattern/.test(st['Unsafe pattern'].notes));
  check('IFC2X3 specification shows Pass with the version note', st['Written for IFC2X3'].state.includes('Pass') && /lists IFC2X3/.test(st['Written for IFC2X3'].notes));
  check('every state has a word and a mark, not colour alone', states.every((s) => /^[✓✗–?] (Pass|Fail|Nothing to check|Not checked)$/.test(s.state)), states.map((s) => s.state).join(' / '));
  const prohibitedRow = run.locator('.spec', { hasText: 'Prohibited, found' });
  await prohibitedRow.locator('summary').click();
  check('prohibited and found lists the elements that must not be there', (await prohibitedRow.locator('tbody tr').count()) === 2 && /must not be in the model/.test(await prohibitedRow.locator('tbody tr').first().innerText()));
  check('no jargon in the states page', !JARGON.test(await pageText()), (await pageText()).match(JARGON)?.[0] ?? '');
  await page.screenshot({ path: path.join(out, 'shot-states.png'), fullPage: true });

  await load(uncheckedIds, goodIfc);
  await settled();
  const hu = await run.locator('.headline').innerText();
  check('one pass and one unchecked is not "all passed"', hu === '1 of 2 specifications passed. 1 could not be checked.' && (await run.locator('.headline').getAttribute('class')).includes('incomplete'), hu);

  // ---- inputs that lie --------------------------------------------------------
  for (const [label, idsFile, ifcFile, pattern] of refusals) {
    await load(idsFile, ifcFile);
    await settled();
    const msg = await run.locator('.error').innerText().catch(() => '');
    const noVerdict = (await run.locator('.headline').count()) === 0 && (await run.locator('.spec').count()) === 0;
    const offersCheck = (await run.getByRole('button', { name: 'Show them in Check' }).count()) === 1;
    const shouldOffer = /problem, so the result/.test(pattern.source);
    check(`${label}: plain sentence, no verdict${shouldOffer ? ', and Show them in Check offered' : ''}`, offersCheck === shouldOffer && pattern.test(msg) && noVerdict && !JARGON.test(msg) && !/0 of 0/.test(await pageText()), msg || '(no message; a result was shown)');
  }
  const bom = write('bom.ifc', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(twoWalls)]));
  await load(goodIds, bom);
  await settled();
  check('IFC with a UTF-8 byte order mark is checked', (await run.locator('.headline').innerText().catch(() => '')) === 'The one specification passed.');
  const oneLine = write('one-line.ifc', ifcText('IFC4', Array.from({ length: 3000 }, (_, i) => wall(i + 1)).join('')).replace(/\n/g, ''));
  await load(goodIds, oneLine);
  await settled();
  check('IFC written as one long line is checked, all 3,000 walls', (await pageText()).includes('Applied to 3,000 elements: 3,000 passed, 0 failed.'));

  // ---- the worker -------------------------------------------------------------
  // A second pair after a first: the old result goes the moment a file changes.
  await load(goodIds, goodIfc);
  await settled();
  check('first pair passes', (await run.locator('.headline').innerText()) === 'The one specification passed.');
  await setFiles(otherIds, null);
  check('choosing another file removes the previous result at once', (await run.locator('.headline').count()) === 0 && (await run.locator('.spec').count()) === 0 && (await run.getByRole('button', { name: 'Download report' }).count()) === 0);
  await runButton.click();
  await settled();
  const second = await pageText();
  check('second pair shows its own result under its own names', /^0 of 1/.test(await run.locator('.headline').innerText()) && second.includes('Walls are named Wilma') && second.includes('IDS file: walls-named-wilma.ids') && !second.includes('Walls are named Waldo'));

  // Changing a file while a run is in progress: the run must not deliver.
  await page.goto(origin + '/');
  await setFiles(bigIds, bigIfc);
  workersStarted = 0;
  workerDelay = 3000;
  await runButton.dblclick();
  check('Run is disabled while a check is in progress', await runButton.isDisabled() && (await runButton.innerText()) === 'Working...');
  await run.locator('.working').waitFor({ timeout: 10000 });
  await setFiles(goodIds, null);
  check('changing a file during a run stops it: no progress text, Run available again', (await run.locator('.working').count()) === 0 && !(await runButton.isDisabled()));
  workerDelay = 0;
  await page.waitForTimeout(8000);
  check('the stopped run never shows a result under the new file name', (await run.locator('.headline').count()) === 0 && (await run.locator('.spec').count()) === 0);
  await setFiles(null, goodIfc);
  await runButton.click();
  await settled();
  check('a run after a stopped run gives the new pair its own result', (await run.locator('.headline').innerText()) === 'The one specification passed.' && (await pageText()).includes('Model: two-walls.ifc'));

  // Run clicked twice in quick succession.
  await page.goto(origin + '/');
  await setFiles(goodIds, goodIfc);
  workersStarted = 0;
  await runButton.dblclick();
  await settled();
  await page.waitForTimeout(500);
  check('clicking Run twice starts one check, not two', workersStarted === 1 && (await run.locator('.headline').count()) === 1, `workers started: ${workersStarted}`);

  // The worker fails to start or crashes.
  breakWorker = true;
  await load(goodIds, goodIfc);
  await settled();
  const crash = await run.locator('.error').innerText().catch(() => '');
  check('a crashed worker gives a plain sentence and no result', /did not finish, so there is no result/.test(crash) && !JARGON.test(crash) && (await run.locator('.headline').count()) === 0 && !(await runButton.isDisabled()), crash);
  breakWorker = false;
  await runButton.click();
  await run.locator('.headline').waitFor({ timeout: 60000 });
  check('Run works again after a crash', (await run.locator('.headline').innerText()) === 'The one specification passed.' && (await run.locator('.error').count()) === 0);
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
  check('both boxes take a file with Enter or Space', (await run.locator('.drop-detail').nth(0).innerText()).includes('states.ids') && (await run.locator('.drop-detail').nth(1).innerText()).includes('two-walls.ifc'));
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

  // ---- Check tab ----------------------------------------------------------------
  const engine = (f) => JSON.parse(execFileSync(path.resolve('node_modules/.bin/vite-node'), ['scripts/engine-findings.ts', f], { encoding: 'utf8' }).split('@@')[1]);
  const shots = path.resolve('.scratch/shots');
  fs.mkdirSync(shots, { recursive: true });
  const officialInvalid = path.join(cases, 'invalid-prohibited_specifications_invalid_if_requirements_are_specified.ids');
  const officialInvalidIfc = officialInvalid.replace(/\.ids$/, '.ifc');
  const ref = engine(officialInvalid);
  const refErrors = ref.findings.filter((f) => f.severity === 'error').length;
  const noun = (n) => `${n} ${n === 1 ? 'problem' : 'problems'}`;
  const chkFile = checkPanel.locator('input[type=file]');
  const chkSettled = () => checkPanel.locator('.headline, .error').first().waitFor({ timeout: 60000 });
  const chkText = () => checkPanel.innerText();
  const openCheck = async () => { await page.goto(origin + '/'); await page.getByRole('tab', { name: 'Check' }).click(); };
  const shoot = async (name) => {
    for (const w of [1100, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.screenshot({ path: path.join(shots, `${name}-${w}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1000, height: 900 });
  };
  check('the engine rejects the official invalid file, with a position', !ref.valid && ref.findings.length >= 1 && ref.findings[0].line > 0, JSON.stringify(ref.findings.map((f) => f.code)));

  await openCheck();
  check('Check tab, nothing chosen: no result, no button, the privacy line is there', (await checkPanel.locator('.headline, .error, .finding').count()) === 0 && (await checkPanel.getByRole('button', { name: 'Download report' }).count()) === 0 && (await chkText()).includes('This file is checked in your browser and is not uploaded.'));
  check('Check tab: one drop zone, labelled as in Run', (await checkPanel.locator('.drop').count()) === 1 && (await checkPanel.locator('.drop-label').innerText()) === 'IDS file (.ids)');

  // valid file
  await chkFile.setInputFiles(goodIds);
  await chkSettled();
  check('valid file: headline in words, no extra button pressed', (await checkPanel.locator('.headline').innerText()) === 'This IDS file is valid.' && (await checkPanel.locator('.headline').getAttribute('class')).includes('pass'));
  check('valid file: version found is shown, no rows', (await chkText()).includes('IDS version found: 1.0.') && (await checkPanel.locator('.finding').count()) === 0);
  const validRep = await (async () => { const dl = page.waitForEvent('download'); await checkPanel.getByRole('button', { name: 'Download report' }).click(); const d = await dl; const p = path.join(out, 'check-valid.json'); await d.saveAs(p); return { json: JSON.parse(fs.readFileSync(p, 'utf8')), name: d.suggestedFilename() }; })();
  check('valid file: report is one JSON file named after the IDS file', validRep.json.valid === true && validRep.json.file === 'walls-named-waldo.ids' && validRep.json.findings.length === 0 && validRep.name === 'walls-named-waldo-check-report.json', validRep.name);
  await shoot('check-valid');

  // invalid official file
  await chkFile.setInputFiles(officialInvalid);
  await chkSettled();
  const head = await checkPanel.locator('.headline').innerText();
  check('invalid official file: headline counts the engine\'s errors', head === `This IDS file has ${noun(refErrors)}.` && (await checkPanel.locator('.headline').getAttribute('class')).includes('fail'), head);
  const rowCount = await checkPanel.locator('.finding').count();
  check('invalid official file: one row per engine finding', rowCount === ref.findings.length, `${rowCount} rows, engine ${ref.findings.length}`);
  const r0 = checkPanel.locator('.finding').first();
  const r0text = await r0.innerText();
  const f0 = ref.findings[0];
  check('first row: message, position and short code', r0text.includes(f0.message) && r0text.includes(f0.column ? `line ${f0.line}, column ${f0.column}` : `line ${f0.line}`) && (await r0.locator('code').innerText()) === f0.code, r0text.replace(/\n/g, ' | '));
  check('rows start closed', (await checkPanel.locator('.excerpt').count()) === 0);
  await r0.locator('summary').click();
  const ex = await r0.locator('.excerpt').innerText();
  const sourceLines = fs.readFileSync(officialInvalid, 'utf8').split(/\r\n|\n|\r/);
  const marked = ex.split('\n').find((l) => l.startsWith('>'));
  check('excerpt marks the engine\'s line and shows that line of the file', marked !== undefined && marked.includes(sourceLines[f0.line - 1].trim()) && marked.includes(`${f0.line} |`), marked);
  const exLines = ex.split('\n').filter((l) => /^[> ] *\d+ \|/.test(l));
  check('excerpt has two lines of context each side (when the file has them)', exLines.length === Math.min(sourceLines.length, f0.line + 2) - Math.max(1, f0.line - 2) + 1, `${exLines.length} lines`);
  check('excerpt is monospaced, scrolls sideways, and is plain text', await r0.locator('.excerpt').evaluate((e) => { const c = getComputedStyle(e); return c.whiteSpace === 'pre' && c.overflowX === 'auto' && /mono|Menlo|Consolas/i.test(c.fontFamily) && e.children.length === 0; }));
  const invRep = await (async () => { const dl = page.waitForEvent('download'); await checkPanel.getByRole('button', { name: 'Download report' }).click(); const d = await dl; const p = path.join(out, 'check-invalid.json'); await d.saveAs(p); return JSON.parse(fs.readFileSync(p, 'utf8')); })();
  check('report holds the same findings as the engine', invRep.valid === false && JSON.stringify(invRep.findings) === JSON.stringify(ref.findings) && invRep.errors === refErrors);
  await shoot('check-invalid-row-open');

  // not an IDS at all
  const notXml = path.join(out, 'text.ids');
  for (const [label, file, pattern] of [
    ['not an XML file', notXml, /^This file is not XML, so it is not an IDS file\. Check that you chose the right file\.$/],
    ['an IFC model dropped by mistake', goodIfc, /^This is an IFC model, not an IDS file\. Choose an IDS file here\. To check a model against an IDS file, use the Run tab\.$/],
    ['an empty file', path.join(out, 'empty.ids'), /^This file is empty\. Choose the IDS file again/],
    ['an XML file that is not an IDS', path.join(out, 'page.ids'), /^This is an XML file but not an IDS file: it starts with <html>, not <ids>\./],
  ]) {
    await chkFile.setInputFiles(file);
    await chkSettled();
    const t = await checkPanel.locator('.error').innerText().catch(() => '');
    check(`${label}: one plain sentence, no rows, no report`, pattern.test(t) && (await checkPanel.locator('.finding, .headline').count()) === 0 && (await checkPanel.getByRole('button', { name: 'Download report' }).count()) === 0 && !JARGON.test(t), t);
  }
  // XML that breaks off keeps its position
  await chkFile.setInputFiles(path.join(out, 'cut-off.ids'));
  await chkSettled();
  check('XML cut off: a sentence says what to do and one row points at the break', /not valid XML, so it could not be checked further\. Open it in the tool that made it, save it again/.test(await checkPanel.locator('.headline').innerText()) && (await checkPanel.locator('.finding').count()) === 1);

  // the old result goes the moment another file is chosen, and a slower check never overtakes a later one
  await chkFile.setInputFiles(officialInvalid);
  await chkSettled();
  slowEngine = 2500;
  await chkFile.setInputFiles(goodIds);
  check('choosing another file removes the old rows, headline and report at once', (await checkPanel.locator('.finding, .headline, .excerpt').count()) === 0 && (await checkPanel.getByRole('button', { name: 'Download report' }).count()) === 0 && (await checkPanel.locator('.working').innerText()) === 'Checking the IDS file...');
  await chkFile.setInputFiles(otherIds);
  await chkFile.setInputFiles(officialInvalid);
  await chkSettled();
  await page.waitForTimeout(3500);
  check('of three files chosen in a row, only the last one shows a result', (await checkPanel.locator('.headline').innerText()) === `This IDS file has ${noun(refErrors)}.` && (await checkPanel.locator('.drop-detail').innerText()).includes('invalid-prohibited'));
  slowEngine = 0;

  // keyboard
  await page.goto(origin + '/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowLeft');
  const kTab = await focused();
  const kChooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Tab');
  const kDrop = await focused();
  await page.keyboard.press('Enter');
  await (await kChooser).setFiles(officialInvalid);
  await chkSettled();
  await page.keyboard.press('Tab');
  const kRow = await focused();
  await page.keyboard.press('Enter');
  await checkPanel.locator('.excerpt').waitFor({ timeout: 5000 });
  const kOpen = await page.evaluate(() => document.activeElement.parentElement.open);
  await page.keyboard.press('Tab');
  const kExcerpt = await page.evaluate(() => document.activeElement.className);
  let kDownload = '';
  for (let i = 0; i < ref.findings.length + 1 && !/Download report/.test(kDownload); i++) { await page.keyboard.press('Tab'); kDownload = await focused(); }
  check('keyboard: arrow to the Check tab, then its drop zone, a row, the excerpt and Download report are all reachable', kTab === 'tab:Check' && kDrop === 'button:IDS file (.ids)' && kRow.startsWith('summary:') && kOpen && kExcerpt === 'excerpt' && /Download report/.test(kDownload), [kTab, kDrop, kRow, kExcerpt, kDownload].join(' > '));
  check('keyboard: the focused row shows a focus ring', await (async () => { await page.keyboard.press('Shift+Tab'); return page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'); })());

  // Run refuses an invalid IDS, and Show them in Check carries the same file over
  await page.goto(origin + '/');
  await setFiles(officialInvalid, officialInvalidIfc);
  await runButton.click();
  await settled();
  const refused = await run.locator('.error').innerText();
  check('Run with an invalid IDS: refusal sentence with the count, no verdict, no result', refused === `This IDS file has ${noun(refErrors)}, so the result could not be trusted.` && (await run.locator('.headline, .spec, .results').count()) === 0 && !(await runButton.isDisabled()), refused);
  await shoot('run-refused');
  const showBtn = run.getByRole('button', { name: 'Show them in Check' });
  await page.keyboard.press('Tab');
  let kShow = await focused();
  for (let i = 0; i < 3 && kShow !== 'button:Show them in Check'; i++) { await page.keyboard.press('Tab'); kShow = await focused(); }
  check('keyboard: Show them in Check is reachable by Tab', kShow === 'button:Show them in Check', kShow);
  await page.keyboard.press('Enter');
  check('Show them in Check switches to the Check tab and moves focus there', (await page.getByRole('tab', { name: 'Check' }).getAttribute('aria-selected')) === 'true' && (await focused()) === 'tab:Check' && (await checkPanel.isVisible()) && !(await run.isVisible()));
  await chkSettled();
  check('...with the same file already loaded and the same findings', (await checkPanel.locator('.drop-detail').innerText()).includes('invalid-prohibited') && (await checkPanel.locator('.headline').innerText()) === `This IDS file has ${noun(refErrors)}.` && (await checkPanel.locator('.finding').count()) === ref.findings.length && (await checkPanel.locator('.finding').first().innerText()).includes(ref.findings[0].message));
  await page.getByRole('tab', { name: 'Run' }).click();
  check('back in Run, the refusal is still shown for that file', (await run.locator('.error').innerText()) === refused);
  await setFiles(goodIds, goodIfc);
  check('choosing another IDS file in Run clears the refusal and its button', (await run.locator('.error').count()) === 0 && (await showBtn.count()) === 0);
  await runButton.click();
  await settled();
  check('Run with a valid pair still works after a refusal', (await run.locator('.headline').innerText()) === 'The one specification passed.' && (await run.locator('.results').locator('xpath=preceding-sibling::p[1]').innerText()) === 'The IDS file was checked first and is valid.');

  // a large IDS
  const bigSpecs = write('large-2000.ids', execFileSync('node', ['scripts/make-large-ids.mjs', '2000', path.join(out, 'large-2000.ids')]) && fs.readFileSync(path.join(out, 'large-2000.ids')));
  await openCheck();
  await page.evaluate(() => {
    window.__gaps = { max: 0 };
    let last = performance.now();
    setInterval(() => { const n = performance.now(); window.__gaps.max = Math.max(window.__gaps.max, n - last - 20); last = n; }, 20);
  });
  const tBig = Date.now();
  await chkFile.setInputFiles(bigSpecs);
  const sawWorking = await checkPanel.locator('.working').innerText().then((t) => t === 'Checking the IDS file...').catch(() => false);
  await chkSettled();
  const bigSeconds = (Date.now() - tBig) / 1000;
  const blockedMs = await page.evaluate(() => window.__gaps.max);
  console.log(`LARGE IDS (2000 specifications, ${fs.statSync(bigSpecs).size} bytes): ${bigSeconds.toFixed(2)} s from choosing the file to the headline; longest freeze of the page ${blockedMs.toFixed(0)} ms; "Checking the IDS file..." seen while it ran: ${sawWorking}`);
  check('large IDS (2,000 specifications): valid, and the page stayed responsive (no freeze over 500 ms)', (await checkPanel.locator('.headline').innerText()) === 'This IDS file is valid.' && blockedMs < 500, `${bigSeconds.toFixed(2)} s, longest freeze ${blockedMs.toFixed(0)} ms`);

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
  const hb = await run.locator('.headline').innerText().catch(() => '');
  console.log(`SCALE ${WALLS} walls, ${fs.statSync(bigIfc).size} bytes: ${seconds.toFixed(1)} s from Run to result; browser memory (all Chromium processes, resident) ${mem.before.toFixed(0)} MB before, ${mem.peak.toFixed(0)} MB peak`);
  check('scale: every wall fails one specification', /^0 of 1 specification passed\./.test(hb) && (await pageText()).includes(`Applied to ${WALLS.toLocaleString('en')} elements: 0 passed, ${WALLS.toLocaleString('en')} failed.`), hb);
  await run.locator('summary.spec-head').first().click();
  check('scale: the page lists 200 rows', (await run.locator('.spec tbody tr').count()) === 200);
  const more = await run.locator('details .note').last().innerText();
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
