// Drives the built site's Write tab in headless Chromium with the network blocked.
// Usage: node scripts/write-check.mjs <clone of buildingSMART/IDS> <ids.xsd with local imports> [screenshot dir]
//   (make the second argument with scripts/local-xsd.mjs; xmllint is /usr/bin/xmllint on macOS)
// Downloads and screenshots go to .scratch/write-check/ unless a directory is given.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';
import { parseIDS } from '@ifc-lite/ids';

const [repo, xsd, shotDir = path.resolve('.scratch/write-check')] = process.argv.slice(2);
if (!repo || !xsd) throw new Error('usage: write-check.mjs <IDS repo clone> <ids.xsd> [screenshot dir]');
const dist = path.resolve('dist');
const out = path.resolve('.scratch/write-check');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
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
const xmllint = (file) => {
  const r = spawnSync('/usr/bin/xmllint', ['--noout', '--nonet', '--schema', xsd, file], { encoding: 'utf8', env: { ...process.env, XML_CATALOG_FILES: '/dev/null' } });
  return { ok: r.status === 0, message: r.stderr.split('\n').filter((l) => !/validates$/.test(l)).slice(0, 2).join(' ') };
};

// A tiny model: one wall called Waldo with FireRating 2HR. It meets the first specification and not the second.
const ifc = path.join(out, 'one-wall.ifc');
fs.writeFileSync(ifc, [
  "ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');", "FILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
  "#1=IFCWALL('0000000000000000000001',$,'Waldo',$,$,$,$,$,$);",
  "#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('2HR'),$);",
  "#3=IFCPROPERTYSET('0000000000000000000002',$,'Pset_WallCommon',$,(#2));",
  "#4=IFCRELDEFINESBYPROPERTIES('0000000000000000000003',$,$,$,(#1),#3);",
  "ENDSEC;", "END-ISO-10303-21;", ''].join('\n'));

const norm = (x) => {
  if (typeof x === 'string') return x.replace(/\s+/g, ' ').trim();
  if (Array.isArray(x)) return x.map(norm);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k, v]) => k !== 'schemaLocation' && v !== undefined).map(([k, v]) => [k, norm(v)]));
  return x;
};
const differences = (a, b, p = '') => {
  if (isDeepStrictEqual(a, b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => differences(a[k], b[k], `${p}.${k}`));
  }
  return [`${p}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
};
const quiet = (fn) => { const o = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = o; } };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const blocked = [], local = [], pageErrors = [];
  const newContext = async (viewport) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) { local.push(u); return route.continue(); }
      blocked.push(u); return route.abort();
    });
    return ctx;
  };
  const ctx = await newContext({ width: 1000, height: 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const write = page.locator('#panel-write');
  const run = page.locator('#panel-run');
  const goWrite = async (p = page) => { await p.goto(origin + '/'); await p.getByRole('tab', { name: 'Write' }).click(); };
  let suggested = '';
  const download = async (p, name) => {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download .ids' }).click()]);
    const file = path.join(out, name);
    await dl.saveAs(file);
    suggested = dl.suggestedFilename();
    return file;
  };
  const spec = (n) => write.locator('li.spec').nth(n);

  // ---- the empty editor ---------------------------------------------------------
  await goWrite();
  await page.screenshot({ path: path.join(shotDir, 'write-1-empty.png'), fullPage: true });
  const empty = await write.innerText();
  check('empty editor invites the first action', /No specifications yet\. Add the first one/.test(empty));
  check('top bar: New, Open…, Download .ids, Use this IDS in Run', ['New', 'Open…', 'Download .ids', 'Use this IDS in Run'].every((n) => empty.includes(n)));
  check('shows the file name and no unsaved mark on a blank document', empty.includes('Untitled.ids') && !empty.includes('unsaved changes'));
  check('says where the draft is kept in one sentence', empty.includes('Your draft stays in this browser tab until you close it. Nothing is uploaded.'));
  const dlBtn = page.getByRole('button', { name: 'Download .ids' });
  check('Download is off on a blank document, with a reason in words', (await dlBtn.isDisabled()) && /Download is off until this is fixed: About this IDS: Give the IDS a title\./.test(await write.locator('#write-reason').innerText()));
  check('Use this IDS in Run is off too', await page.getByRole('button', { name: 'Use this IDS in Run' }).isDisabled());
  check('nothing is stored while nothing is written', await page.evaluate(() => sessionStorage.length === 0 && localStorage.length === 0));

  // ---- create from blank, with the mouse --------------------------------------
  await write.getByLabel('Title').fill('Wall checks');
  await write.locator('details.more').first().locator('summary').click();
  await write.getByLabel('Author (email address)').fill('nobody');
  check('a bad email address gets a message beside the field', (await write.innerText()).includes('This does not look like an email address, for example name@company.com.'));
  await write.getByLabel('Author (email address)').fill('petru@bimvoice.com');
  check('a good email address clears it', !(await write.innerText()).includes('does not look like an email'));
  check('an unsaved mark appears', (await write.locator('#write-status').innerText()).includes('unsaved changes'));

  await write.getByRole('button', { name: 'Add a specification' }).click();
  const s1 = spec(0);
  check('a new specification opens in place with its Name field focused', await page.evaluate(() => document.activeElement?.closest('.spec-body') !== null && document.activeElement.tagName === 'INPUT'));
  await s1.getByLabel('Name', { exact: true }).fill('Walls have a fire rating');
  // Applies to: Type of element
  await s1.getByRole('button', { name: 'Add an item to Applies to' }).click();
  await s1.getByRole('button', { name: 'Type of element' }).click();
  await s1.getByLabel('Value', { exact: true }).first().fill('IFCWALL');
  const dlReason = await write.locator('#write-reason').innerText();
  check('Download stays off while something is missing, and says what', (await dlBtn.isDisabled()) || dlReason === '');
  // Must have: Property with a list, and Attribute with a pattern
  const must1 = s1.getByRole('region', { name: 'Must have' });
  await must1.getByRole('button', { name: 'Add an item to Must have' }).click();
  await must1.getByRole('button', { name: 'Property', exact: true }).click();
  const prop = must1.locator('li.facet').nth(0);
  await prop.getByLabel('Value', { exact: true }).first().fill('Pset_WallCommon'); // property set (exact value)
  await prop.getByLabel('Value', { exact: true }).nth(1).fill('FireRating');      // property name
  await prop.getByLabel('Data type').fill('IFCLABEL');
  await prop.locator('fieldset', { hasText: 'How to match' }).nth(2).getByLabel('How to match').selectOption('list');
  await prop.getByLabel('Values').fill('1HR\n2HR');
  await must1.getByRole('button', { name: 'Add an item to Must have' }).click();
  await must1.getByRole('button', { name: 'Attribute', exact: true }).click();
  const attr = must1.locator('li.facet').nth(1);
  await attr.getByLabel('Value', { exact: true }).first().fill('Name');
  await attr.locator('fieldset', { hasText: 'Value' }).last().getByLabel('How to match').selectOption('pattern');
  await attr.getByLabel('Pattern').fill('(');
  check('a pattern that is not valid gets a message beside the field', (await attr.innerText()).includes('This is not a valid pattern.'));
  check('and Download is off with the reason', (await dlBtn.isDisabled()) && /not a valid pattern/.test(await write.locator('#write-reason').innerText()));
  await attr.getByLabel('Pattern').fill('Wal.*');
  check('a valid pattern clears it', !(await attr.innerText()).includes('not a valid pattern'));

  // The In-words sentence
  const words1 = await s1.locator('.words').innerText();
  check('"In words" line for the specification', words1.includes('Every wall must have the property FireRating in Pset_WallCommon set to one of "1HR", "2HR" and the attribute Name with a value matching the pattern "Wal.*". The model must contain at least one wall.'), words1);

  // Second specification: classification with a text length; will fail on the model.
  await write.getByRole('button', { name: 'Add a specification' }).click();
  const s2 = spec(1);
  check('opening a new specification closes the other (accordion)', (await write.locator('.spec-body').count()) === 1);
  await s2.getByLabel('Name', { exact: true }).fill('Walls are classified');
  await s2.getByRole('button', { name: 'Add an item to Applies to' }).click();
  await s2.getByRole('button', { name: 'Type of element' }).click();
  await s2.getByLabel('Value', { exact: true }).first().fill('IFCWALL');
  const must2 = s2.getByRole('region', { name: 'Must have' });
  await must2.getByRole('button', { name: 'Add an item to Must have' }).click();
  await must2.getByRole('button', { name: 'Classification', exact: true }).click();
  const cl = must2.locator('li.facet').nth(0);
  await cl.getByLabel('Value', { exact: true }).first().fill('Uniclass 2015');
  await cl.locator('fieldset', { hasText: 'Code' }).last().getByLabel('How to match').selectOption('length');
  await cl.getByLabel('At least (characters)').fill('3');
  check('only the inputs the choice needs are shown (text length)', (await cl.getByLabel('Pattern').count()) === 0 && (await cl.getByLabel('Values').count()) === 0 && (await cl.getByLabel('At least (characters)').count()) === 1);
  await page.screenshot({ path: path.join(shotDir, 'write-2-edited.png'), fullPage: true });

  check('Download is on once nothing is missing', await dlBtn.isEnabled());
  const f1 = await download(page, 'wall-checks.ids');
  const text1 = fs.readFileSync(f1, 'utf8');
  const lint1 = xmllint(f1);
  check('the downloaded file is valid against the official IDS 1.0 schema (xmllint)', lint1.ok, lint1.message);
  check('the file name comes from the title', suggested === 'wall-checks.ids', suggested);
  const p1 = quiet(() => parseIDS(text1));
  check('the file holds two specifications', p1.specifications.length === 2);
  const kinds = new Set(p1.specifications.flatMap((s) => [...s.applicability.facets, ...s.requirements.map((r) => r.facet)].map((f) => f.type)));
  check('facet kinds in the file: entity, property, attribute, classification', ['entity', 'property', 'attribute', 'classification'].every((k) => kinds.has(k)), [...kinds].join(','));
  check('restriction kinds in the file: list, pattern and length', /<xs:enumeration value="1HR"\/>/.test(text1) && /<xs:pattern value="Wal\.\*"\/>/.test(text1) && /<xs:minLength value="3"\/>/.test(text1));
  check('after download the unsaved mark is gone', !(await write.locator('#write-status').innerText()).includes('unsaved'));

  // ---- hand-off to Run ---------------------------------------------------------
  await page.getByRole('button', { name: 'Use this IDS in Run' }).click();
  await run.locator('.drop-detail', { hasText: 'wall-checks.ids' }).first().waitFor({ timeout: 5000 }).catch(() => {});
  const handed = [await page.getByRole('tab', { name: 'Run' }).getAttribute('aria-selected'), await run.locator('.drop-detail').first().innerText()];
  check('Use this IDS in Run switches to the Run tab with the file in the IDS box', handed[0] === 'true' && handed[1].includes('wall-checks.ids'), JSON.stringify(handed));
  await run.locator('input[type=file]').nth(1).setInputFiles(ifc);
  await run.locator('button.primary').click();
  await run.locator('.headline, .error').first().waitFor({ timeout: 60000 });
  const states = await run.locator('.spec').evaluateAll((els) => els.map((e) => [e.querySelector('.spec-name').textContent, e.querySelector('.state').textContent.trim()]));
  check('Run shows the first specification as Pass and the second as Fail', states.length === 2 && /Pass/.test(states[0][1]) && /Fail/.test(states[1][1]) && states[0][0] === 'Walls have a fire rating', JSON.stringify(states));

  // ---- open an official example, change one value ------------------------------
  await page.getByRole('tab', { name: 'Write' }).click();
  const example = path.join(repo, 'Documentation/Examples/IDS_demo_BIM-basis-ILS.ids');
  page.once('dialog', (d) => d.accept());
  await write.locator('input[type=file]').setInputFiles(example);
  await write.locator('#write-status .file-name', { hasText: 'IDS_demo_BIM-basis-ILS.ids' }).waitFor();
  check('opening a file shows its name and no unsaved mark', !(await write.locator('#write-status').innerText()).includes('unsaved'));
  await write.locator('li.spec').first().locator('.spec-toggle').click();
  const oldName = await spec(0).getByLabel('Name', { exact: true }).inputValue();
  await spec(0).getByLabel('Name', { exact: true }).fill(oldName + ' (revised)');
  check('editing marks the file unsaved', (await write.locator('#write-status').innerText()).includes('unsaved changes'));
  const f2 = await download(page, 'example-edited.ids');
  const a = norm(quiet(() => parseIDS(fs.readFileSync(example, 'utf8'))));
  const b = norm(quiet(() => parseIDS(fs.readFileSync(f2, 'utf8'))));
  const diff = differences(a, b);
  check('only the one changed value differs between the example and the download', diff.length === 1 && diff[0].startsWith('.specifications.0.name:'), diff.join(' | '));
  check('the edited example is valid against the schema', xmllint(f2).ok);
  check('the download keeps the opened file name', suggested === 'IDS_demo_BIM-basis-ILS.ids', suggested);

  // ---- an IDS 0.9.7 file is refused -------------------------------------------
  const draft = path.join(out, 'draft-0.9.7.ids');
  fs.writeFileSync(draft, fs.readFileSync(path.join(out, 'wall-checks.ids'), 'utf8').replace('IDS/1.0/ids.xsd', 'IDS/0.9.7/ids.xsd'));
  page.once('dialog', (d) => d.accept());
  await write.locator('input[type=file]').setInputFiles(draft);
  await write.locator('.error').waitFor();
  check('opening an IDS 0.9.7 file is refused with one plain sentence', (await write.locator('.error').innerText()) === 'This file is written for IDS 0.9.7. idsbench works with IDS 1.0 only, so it was not opened.');
  check('and the document in the editor is untouched', (await write.locator('#write-status .file-name').innerText()) === 'IDS_demo_BIM-basis-ILS.ids');

  // ---- phone width ----------------------------------------------------------
  const phoneCtx = await newContext({ width: 390, height: 844 });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => pageErrors.push(String(e)));
  await goWrite(phone);
  await phone.locator('#panel-write input[type=file]').setInputFiles(f1);
  await phone.locator('#panel-write li.spec').first().locator('.spec-toggle').click();
  await phone.screenshot({ path: path.join(shotDir, 'write-3-phone-390.png'), fullPage: true });
  check('at 390 px wide the page does not scroll sideways', await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), await phone.evaluate(() => `${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}`));
  await phoneCtx.close();

  // ---- keyboard only: one specification, one facet ---------------------------
  const kbCtx = await newContext({ width: 1000, height: 900 });
  const kb = await kbCtx.newPage();
  kb.on('pageerror', (e) => pageErrors.push(String(e)));
  await kb.goto(origin + '/');
  const describe = () => kb.evaluate(() => {
    const e = document.activeElement;
    const lab = e.getAttribute('aria-label') ?? (e.labels?.[0]?.textContent ?? '') ?? '';
    return `${e.tagName.toLowerCase()}|${lab.trim()}|${(e.textContent ?? '').trim().slice(0, 40)}`;
  });
  const tabTo = async (re, max = 80) => {
    for (let i = 0; i < max; i++) { await kb.keyboard.press('Tab'); if (re.test(await describe())) return true; }
    return false;
  };
  await kb.keyboard.press('Tab'); // the tab list: Run is selected
  await kb.keyboard.press('ArrowLeft'); await kb.keyboard.press('ArrowLeft'); // Check, then Write
  check('arrow keys reach the Write tab', (await kb.getByRole('tab', { name: 'Write' }).getAttribute('aria-selected')) === 'true');
  check('Tab reaches the Title field', await tabTo(/^input\|Title\|/));
  await kb.keyboard.type('Keyboard only');
  check('Tab reaches "Add a specification"', await tabTo(/^button\|\|Add a specification/));
  await kb.keyboard.press('Enter');
  check('Enter adds a specification and focus lands in its Name field', /^input\|Name\|/.test(await describe()));
  await kb.keyboard.type('Walls exist');
  check('Tab reaches "Add an item to Applies to"', await tabTo(/^button\|Add an item to Applies to\|/));
  await kb.keyboard.press('Enter');
  check('Enter opens the list of kinds with focus on the first', /^button\|\|Type of element/.test(await describe()));
  await kb.keyboard.press('Enter');
  check('choosing a kind puts focus in the new item', /^input\|Value\|/.test(await describe()));
  await kb.keyboard.type('IFCWALL');
  check('Tab reaches Download .ids, now on', await tabTo(/^button\|\|Download \.ids/));
  const [dl] = await Promise.all([kb.waitForEvent('download'), kb.keyboard.press('Enter')]);
  const f3 = path.join(out, 'keyboard-only.ids');
  await dl.saveAs(f3);
  check('the file made without the mouse is valid against the schema', xmllint(f3).ok, xmllint(f3).message);
  check('and holds the typed values', /<title>Keyboard only<\/title>/.test(fs.readFileSync(f3, 'utf8')) && /IFCWALL/.test(fs.readFileSync(f3, 'utf8')));
  await kbCtx.close();

  // ---- draft safety ------------------------------------------------------------
  const dctx = await newContext({ width: 1000, height: 900 });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => pageErrors.push(String(e)));
  await goWrite(dp);
  await dp.locator('#panel-write').getByLabel('Title').fill('Draft that must survive');
  await dp.waitForTimeout(600);
  const store = await dp.evaluate(() => ({ s: Object.keys(sessionStorage), l: localStorage.length, c: document.cookie }));
  check('the draft is in sessionStorage only', store.s.length === 1 && store.l === 0 && store.c === '', JSON.stringify(store));
  await dp.reload();
  await dp.getByRole('tab', { name: 'Write' }).click();
  check('reloading the tab restores the draft', (await dp.locator('#panel-write').getByLabel('Title').inputValue()) === 'Draft that must survive' && (await dp.locator('#write-status').innerText()).includes('unsaved changes'));
  const prompts = [];
  dp.on('dialog', async (d) => { prompts.push(d.type()); await d.accept(); });
  await dp.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 300));
  check('closing the tab with unsaved changes asks first (beforeunload)', prompts.includes('beforeunload'), prompts.join(','));
  await dctx.close();

  const clean = await ctx.newPage();
  await goWrite(clean);
  await clean.locator('#panel-write').getByLabel('Title').fill('x');
  await clean.waitForTimeout(500);
  clean.once('dialog', (d) => d.accept());
  await clean.getByRole('button', { name: 'New' }).click();
  await clean.waitForTimeout(500);
  check('New clears the draft', await clean.evaluate(() => sessionStorage.length === 0));

  // ---- the network ---------------------------------------------------------
  check('no request to anywhere but the local server', blocked.length === 0, `blocked=${JSON.stringify(blocked)} local=${local.length}`);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`assertions passed: ${passed}, failed: ${failed}, total: ${passed + failed}`);
process.exit(failed ? 1 : 0);
