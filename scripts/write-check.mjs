/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Drives writing and editing an IDS file on the one page, in headless Chromium with the network blocked.
// scripts/ASSERTIONS.md lists every assertion and what became of those of the tabbed app.
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
  const ctx = await newContext({ width: 1280, height: 800 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.type()); await d.accept().catch(() => {}); });
  const status = () => page.locator('#ids-status').innerText();
  const reason = () => page.locator('#ids-reason').innerText();
  const dlBtn = page.getByRole('button', { name: 'Download .ids' });
  let suggested = '';
  const download = async (p, name) => {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download .ids' }).click()]);
    const file = path.join(out, name);
    await dl.saveAs(file);
    suggested = dl.suggestedFilename();
    return file;
  };
  const spec = (n) => page.locator('.page-specs > li.spec').nth(n);
  /** Types into a pick-list and takes the first option offered, as a person does: no technical name is typed. */
  const pick = async (scope, label, typed) => {
    const box = scope.getByRole('combobox', { name: label, exact: true });
    await box.fill(typed);
    const first = scope.locator('[role=option]').first();
    await first.waitFor({ timeout: 20000 });
    // A name people look for by what it means carries its plain meaning on a second line: the pick is the first line.
    const text = (await first.innerText()).split('\n')[0];
    await box.press('Enter');
    return text;
  };
  const addSpec = async (how) => {
    await page.getByRole('button', { name: 'Add a specification' }).click();
    const before = await page.locator('.page-specs > li.spec').count();
    await page.getByRole('group', { name: 'Start a specification from' }).getByRole('button', { name: how }).click();
    // A starting shape looks up the IFC tables for its subtypes before it opens.
    await page.waitForFunction((n) => document.querySelectorAll('.page-specs > li.spec').length > n, before, { timeout: 20000 });
  };

  // ---- a new, empty IDS ---------------------------------------------------------
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'New' }).click();
  await page.screenshot({ path: path.join(shotDir, 'write-1-empty.png'), fullPage: true });
  const empty = await page.locator('main').innerText();
  check('empty editor invites the first action', /No specifications yet\. Add the first one/.test(empty) && /Give the IDS a title under "About this IDS", then add the first specification\./.test(empty));
  check('the IDS box holds Open, New and Download .ids', (await page.locator('.drop').first().locator('button').allInnerTexts()).join(',') === 'Open,New,Download .ids,Close');
  check('shows the file name and no unsaved mark on a blank document', /untitled\.ids/i.test(await status()) && !empty.includes('unsaved changes'));
  check('says where unsaved work is kept in one sentence', (await page.locator('.foot').innerText()).includes('Unsaved changes stay in this browser tab until you close it.'));
  check('Download is off on a blank document, with a reason in words', (await dlBtn.isDisabled()) && /Download is off until this is fixed: About this IDS: Give the IDS a title\./.test(await reason()));
  check('a new document is not judged before there is something to judge: no verdict, the stamp cell says New', (await page.locator('.verdict.waiting .verdict-word').innerText()) === 'New' && (await page.locator('.verdict.fail, .verdict.pass').count()) === 0);
  check('nothing is stored while nothing is written', await page.evaluate(() => sessionStorage.length === 0 && localStorage.length === 0));
  check('New puts the keyboard in the Title field, and About this IDS asks for the title only', (await page.evaluate(() => document.activeElement.labels?.[0]?.textContent)) === 'Title' && (await page.locator('.about-form details.more').evaluate((d) => !d.open)));

  // ---- create from blank, with the mouse --------------------------------------
  await page.getByLabel('Title').fill('Wall checks');
  await page.locator('.about-form details.more > summary').click();
  await page.getByLabel('Author (email address)').fill('nobody');
  check('a bad email address gets a message beside the field', (await page.locator('.about').innerText()).includes('This does not look like an email address, for example name@company.com.'));
  await page.getByLabel('Author (email address)').fill('petru@bimvoice.com');
  check('a good email address clears it', !(await page.locator('.about').innerText()).includes('does not look like an email'));
  check('an unsaved mark appears', (await status()).includes('unsaved changes'));

  await page.getByRole('button', { name: 'Add a specification' }).click();
  const offers = await page.getByRole('group', { name: 'Start a specification from' }).locator('button').allInnerTexts();
  check('a specification starts from a pattern: five common shapes, or an empty one', offers.join('|') === 'Elements must have a property|Elements must have a classification|Elements must have a material|Elements must have a name|Elements must not exist in the model|An empty specification|Cancel', offers.join('|'));
  await page.getByRole('button', { name: 'An empty specification' }).click();
  const s1 = spec(0);
  check('a new specification opens in place with its Name field focused', await page.evaluate(() => document.activeElement?.closest('.spec-body') !== null && document.activeElement.tagName === 'INPUT' && document.activeElement.labels[0].textContent === 'Name'));
  await s1.getByLabel('Name', { exact: true }).fill('Walls have a fire rating');
  // Applies to: Type of element, from the pick-list
  await s1.getByRole('button', { name: 'Add an item to Applies to' }).click();
  await s1.getByRole('button', { name: 'Type of element' }).click();
  const pickedClass = await pick(s1, 'IFC class', 'wall');
  check('the IFC class comes from a pick-list with type-ahead: plain name beside the technical one', pickedClass === 'Wall (IfcWall)' && (await s1.getByRole('combobox', { name: 'IFC class', exact: true }).inputValue()) === 'Wall (IfcWall)', pickedClass);
  check('Download stays off while something is missing, and says what', (await dlBtn.isDisabled()) || (await reason()) === '');
  // Must have: Property with a list, and Attribute with a pattern
  const must1 = s1.getByRole('region', { name: 'Must have' });
  await must1.getByRole('button', { name: 'Add an item to Must have' }).click();
  await must1.getByRole('button', { name: 'Property', exact: true }).click();
  const prop = must1.locator('li.facet').nth(0);
  const setsOffered = await (async () => { const box = prop.getByRole('combobox', { name: 'Property set', exact: true }); await box.fill('common'); await prop.locator('[role=option]').first().waitFor(); const t = await prop.locator('[role=option]').allInnerTexts(); await box.press('Escape'); return t; })();
  check('choosing the class narrows the property sets offered to those of that class', setsOffered.includes('Wall common (Pset_WallCommon)') && !setsOffered.some((t) => /Door|Window|Slab/.test(t)), setsOffered.join(' | '));
  const pickedSet = await pick(prop, 'Property set', 'wall common');
  const pickedProp = await pick(prop, 'Property', 'fire r');
  check('the property set and the property come from pick-lists; the property list is that set\'s', pickedSet === 'Wall common (Pset_WallCommon)' && pickedProp === 'Fire rating (FireRating)', `${pickedSet} | ${pickedProp}`);
  check('choosing a standard property fills in its data type', (await prop.getByRole('combobox', { name: 'Data type', exact: true }).inputValue()).includes('IFCLABEL'), await prop.getByRole('combobox', { name: 'Data type', exact: true }).inputValue());
  await prop.getByRole('combobox', { name: 'Value', exact: true }).selectOption('list');
  await prop.getByLabel('Value: values').fill('1HR\n2HR');
  await must1.getByRole('button', { name: 'Add an item to Must have' }).click();
  await must1.getByRole('button', { name: 'Attribute', exact: true }).click();
  const attr = must1.locator('li.facet').nth(1);
  await pick(attr, 'Attribute', 'name');
  await attr.getByRole('combobox', { name: 'Value', exact: true }).selectOption('pattern');
  await attr.getByLabel('Value: pattern').fill('(');
  check('a pattern that is not valid gets a message beside the field', (await attr.innerText()).includes('This is not a valid pattern.'));
  check('and Download is off with the reason', (await dlBtn.isDisabled()) && /not a valid pattern/.test(await reason()));
  await attr.getByLabel('Value: pattern').fill('Wal.*');
  check('a valid pattern clears it', !(await attr.innerText()).includes('not a valid pattern'));

  // The sentence is the face of the specification, and follows the form
  const words1 = await s1.locator('.spec-words').innerText();
  check('"In words" line for the specification', words1 === 'Every wall, including wall elemented case and wall standard case, must have the property FireRating in Pset_WallCommon set to one of "1HR", "2HR" and the attribute Name with a value matching the pattern "Wal.*".', words1);
  const screenWords = await s1.locator('.spec-body').innerText();
  check('plain words on screen: no "facet", "applicability", "cardinality", "restriction" or "how to match" in the form', !/facet|applicability|cardinality|restriction|how to match/i.test(screenWords), screenWords.match(/.{0,120}(facet|applicability|cardinality|restriction|how to match).{0,80}/is)?.[0] ?? '');
  check('the form shows what the common case needs; the rest is behind More options', (await s1.locator('.spec-body > details.more').evaluate((d) => !d.open)) && (await s1.locator('.spec-body > details.more > summary').innerText()) === 'More options' && !(await s1.getByLabel('Identifier').isVisible()));

  // Second specification, from a pattern: two choices finish it.
  await addSpec('Elements must have a classification');
  const s2 = spec(1);
  check('opening a new specification closes the other (accordion)', (await page.locator('.spec-body').count()) === 1);
  check('a pattern arrives complete: it reads as a sentence and has nothing to fix', (await s2.locator('.spec-words').innerText()) === 'Every door, including door standard case, must have a classification in Uniclass 2015.' && (await s2.locator('.error-msg').count()) === 0);
  await s2.getByLabel('Name', { exact: true }).fill('Walls are classified');
  await pick(s2, 'IFC class', 'wall');
  const must2 = s2.getByRole('region', { name: 'Must have' });
  const cl = must2.locator('li.facet').nth(0);
  await cl.getByRole('combobox', { name: 'Code', exact: true }).selectOption('length');
  await cl.getByLabel('At least (characters)').fill('3');
  check('only the inputs the choice needs are shown (text length)', (await cl.getByLabel('Code: pattern').count()) === 0 && (await cl.getByLabel('Code: values').count()) === 0 && (await cl.getByLabel('At least (characters)').count()) === 1);
  await page.screenshot({ path: path.join(shotDir, 'write-2-edited.png'), fullPage: true });
  await page.locator('.verdict.pass .verdict-word', { hasText: 'Valid' }).waitFor({ timeout: 30000 });
  check('while writing, the page checks the file by itself: it is Valid, with nothing pressed', (await page.locator('.headline').innerText()) === 'This IDS file is valid.' && (await page.locator('.to-fix').count()) === 0);

  // The description of the requirements, which the file can carry and the form used to hide.
  const reqMore = s2.locator('section[aria-label="Must have"] details.requirements-more');
  check('the Must have group has its own "More options", closed while there is no description', (await reqMore.locator('summary').innerText()) === 'More options' && (await reqMore.evaluate((d) => !d.open)));
  await reqMore.locator('summary').click();
  await reqMore.getByLabel('Description of the requirements').fill('The wall must carry its classification: "FireRating" <set>');
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
  check('what the pick-lists wrote is the technical form, and the Check engine accepts the file', /<xs:enumeration value="IFCWALL"\/>/.test(text1) && /<xs:enumeration value="IFCWALLSTANDARDCASE"\/>/.test(text1) && /<simpleValue>Pset_WallCommon<\/simpleValue>/.test(text1) && /<simpleValue>FireRating<\/simpleValue>/.test(text1) && /dataType="IFCLABEL"/.test(text1) && JSON.parse(spawnSync(path.resolve('node_modules/.bin/vite-node'), ['scripts/engine-findings.ts', f1], { encoding: 'utf8' }).stdout.split('@@')[1]).findings.length === 0);
  check('after download the unsaved mark is gone', !(await status()).includes('unsaved'));
  check('the description of the requirements is in the file, as the description attribute of the requirements element, and the file is valid', /<requirements description="The wall must carry its classification: &quot;FireRating&quot; &lt;set&gt;">/.test(text1) && lint1.ok);
  {
    const rp = await (await newContext({ width: 1280, height: 800 })).newPage();
    await rp.goto(origin + '/');
    await rp.locator('input[type=file]').first().setInputFiles(f1);
    await rp.locator('#ids-status .file-name', { hasText: 'wall-checks.ids' }).waitFor();
    await rp.getByRole('button', { name: /^Edit Walls are classified/ }).click();
    const more = rp.locator('section[aria-label="Must have"] details.requirements-more').first();
    check('a file with a description of its requirements shows it in the form, open, and it can be edited back to nothing', (await more.evaluate((d) => d.open)) && (await more.getByLabel('Description of the requirements').inputValue()) === 'The wall must carry its classification: "FireRating" <set>');
    await more.getByLabel('Description of the requirements').fill('');
    const f1b = await download(rp, 'wall-checks-no-description.ids');
    check('emptying it removes the attribute from the file', !/<requirements description=/.test(fs.readFileSync(f1b, 'utf8')) && /<requirements>/.test(fs.readFileSync(f1b, 'utf8')));
    await rp.close();
  }

  // ---- the model, on the same page ------------------------------------------------
  await page.locator('input[type=file]').nth(1).setInputFiles(ifc);
  await page.locator('.title-block[data-kind="run"] .headline').waitFor({ timeout: 60000 });
  const states = await page.locator('.page-specs > .spec').evaluateAll((els) => els.map((e) => [e.querySelector('.spec-name').textContent, e.querySelector('.state').textContent.trim()]));
  check('with a model, the first specification is Pass and the second is Fail', states.length === 2 && /Pass|Editing/.test(states[0][1]) && /Fail|Editing/.test(states[1][1]) && states[0][0] === 'Walls have a fire rating' && (await page.locator('.verdict-word').innerText()) === 'Fail', JSON.stringify(states));
  await page.getByRole('button', { name: 'Done editing Walls are classified' }).click();
  const states2 = await page.locator('.page-specs > .spec .state').allInnerTexts();
  check('Done closes the form and the row shows its own result again', states2.join(',') === 'Pass,Fail' && (await page.locator('.spec-body').count()) === 0, states2.join(','));

  // ---- open an official example, change one value ------------------------------
  const example = path.join(repo, 'Documentation/Examples/IDS_demo_BIM-basis-ILS.ids');
  await page.locator('input[type=file]').first().setInputFiles(example);
  await page.locator('#ids-status .file-name', { hasText: 'IDS_demo_BIM-basis-ILS.ids' }).waitFor();
  check('opening a file shows its name and no unsaved mark', !(await status()).includes('unsaved'));
  await spec(0).getByRole('button', { name: /^Edit / }).click();
  const oldName = await spec(0).getByLabel('Name', { exact: true }).inputValue();
  await spec(0).getByLabel('Name', { exact: true }).fill(oldName + ' (revised)');
  check('editing marks the file unsaved', (await status()).includes('unsaved changes'));
  const f2 = await download(page, 'example-edited.ids');
  const a = norm(quiet(() => parseIDS(fs.readFileSync(example, 'utf8'))));
  const b = norm(quiet(() => parseIDS(fs.readFileSync(f2, 'utf8'))));
  const diff = differences(a, b);
  check('only the one changed value differs between the example and the download', diff.length === 1 && diff[0].startsWith('.specifications.0.name:'), diff.join(' | '));
  check('the edited example is valid against the schema', xmllint(f2).ok);
  check('the download keeps the opened file name', suggested === 'IDS_demo_BIM-basis-ILS.ids', suggested);

  // ---- an IDS 0.9.7 file is not IDS 1.0 -------------------------------------------
  const draft = path.join(out, 'draft-0.9.7.ids');
  fs.writeFileSync(draft, fs.readFileSync(path.join(out, 'wall-checks.ids'), 'utf8').replace('IDS/1.0/ids.xsd', 'IDS/0.9.7/ids.xsd'));
  await page.locator('input[type=file]').first().setInputFiles(draft);
  await page.locator('.fix-line').waitFor({ timeout: 30000 });
  await page.locator('.fix-line .fix-details > summary').click();
  check('an IDS 0.9.7 file is Not valid with one plain sentence, the engine\'s own', (await page.locator('.verdict-word').innerText()) === 'Not valid' && (await page.locator('.fix-line .fix-text').innerText()).split('\nDetails')[0] === 'This file is IDS 0.9.7, an older draft. idsbench works with IDS 1.0 only: update the file to version 1.0 in the tool that made it.' && (await page.locator('.fix-line .technical').first().textContent()).includes('This file is IDS 0.9.7. idsbench works with IDS 1.0 only. Update the file to version 1.0 and check it again.'), await page.locator('.fix-line .fix-text').innerText());
  check('and it is not opened in the forms: no Edit, no Fix, and the page says to correct it in the tool that made it', (await page.getByRole('button', { name: /^(Edit|Fix)/ }).count()) === 0 && /This file cannot be changed here\. Correct it in the tool that made it, then open it again\./.test(await page.locator('.to-fix').innerText()));

  // ---- changing one thing in an opened file: fire rating to acoustic rating ---------------------
  await page.locator('input[type=file]').first().setInputFiles(f1);
  await page.locator('#ids-status .file-name', { hasText: 'wall-checks.ids' }).waitFor();
  await page.getByRole('button', { name: 'Edit Walls have a fire rating' }).click();
  const fitsOnScreen = await spec(0).evaluate((e) => { const r = e.getBoundingClientRect(); return { height: Math.round(r.height), viewport: window.innerHeight }; });
  console.log(`OPEN SPECIFICATION at 1280 x 800: the open row is ${fitsOnScreen.height} px tall (viewport ${fitsOnScreen.viewport} px)`);
  const acoustic = await pick(spec(0).getByRole('region', { name: 'Must have' }).locator('li.facet').nth(0), 'Property', 'acoustic');
  await spec(0).locator('.spec-words', { hasText: 'AcousticRating' }).waitFor();
  check('changing "fire rating" to "acoustic rating" is one pick: no name is typed in its technical form', acoustic === 'Acoustic rating (AcousticRating)' && (await spec(0).locator('.spec-words').innerText()).startsWith('Every wall, including wall elemented case and wall standard case, must have the property AcousticRating in Pset_WallCommon'), acoustic);

  // ---- phone width ----------------------------------------------------------
  const phoneCtx = await newContext({ width: 390, height: 844 });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => pageErrors.push(String(e)));
  await phone.goto(origin + '/');
  const fits = () => phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  const emptyFits = await fits();
  await phone.locator('input[type=file]').first().setInputFiles(f1);
  await phone.locator('input[type=file]').nth(1).setInputFiles(ifc);
  await phone.locator('.title-block[data-kind="run"] .headline').waitFor({ timeout: 60000 });
  const resultFits = await fits();
  await phone.locator('.page-specs > li.spec').first().getByRole('button', { name: /^Edit / }).click();
  await phone.locator('.spec-body').waitFor();
  await phone.screenshot({ path: path.join(shotDir, 'write-3-phone-390.png'), fullPage: true });
  check('at 390 px wide the page does not scroll sideways: empty, with a result, and with a form open', emptyFits && resultFits && (await fits()), await phone.evaluate(() => `${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}`));
  await phoneCtx.close();

  // ---- keyboard only: one specification, one item ---------------------------
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
  check('Tab reaches New', await tabTo(/^button\|\|New/));
  await kb.keyboard.press('Enter');
  check('Enter starts a new IDS with the keyboard in the Title field', /^input\|Title\|/.test(await describe()));
  await kb.keyboard.type('Keyboard only');
  check('Tab reaches "Add a specification"', await tabTo(/^button\|\|Add a specification/));
  await kb.keyboard.press('Enter');
  check('Enter opens the list of patterns with focus on the first', /^button\|\|Elements must have a property/.test(await describe()));
  check('Tab reaches "An empty specification"', await tabTo(/^button\|\|An empty specification/));
  await kb.keyboard.press('Enter');
  check('Enter adds a specification and focus lands in its Name field', /^input\|Name\|/.test(await describe()));
  await kb.keyboard.type('Walls exist');
  check('Tab reaches "Add an item to Applies to"', await tabTo(/^button\|Add an item to Applies to\|/));
  await kb.keyboard.press('Enter');
  check('Enter opens the list of kinds with focus on the first', /^button\|\|Type of element/.test(await describe()));
  await kb.keyboard.press('Enter');
  check('choosing a kind puts focus in the new item', /^input\|IFC class\|/.test(await describe()));
  await kb.keyboard.type('wall');
  await kb.locator('[role=option]').first().waitFor({ timeout: 20000 });
  await kb.keyboard.press('Enter');
  check('the pick-list is worked with the keyboard alone: type, Enter', (await kb.evaluate(() => document.activeElement.value)) === 'Wall (IfcWall)');
  // A new specification does not fail a model for having none of its elements; "Walls exist" says the opposite, and the choice is in plain view.
  check('Tab reaches the choice "If the model has no wall" (on "That is fine"), in plain view and not under More options', await tabTo(/^input\|That is fine/));
  await kb.keyboard.press('ArrowDown');
  check('"That is a failure" chosen with the arrow key: the sentence now says the model must contain a wall', (await kb.locator('.spec-words').innerText()).includes('The model must contain at least one wall'));
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
  await dp.goto(origin + '/');
  await dp.getByRole('button', { name: 'New' }).click();
  await dp.getByLabel('Title').fill('Draft that must survive');
  await dp.waitForTimeout(600);
  const store = await dp.evaluate(() => ({ s: Object.keys(sessionStorage), l: localStorage.length, c: document.cookie }));
  check('the draft is in sessionStorage only', store.s.length === 1 && store.l === 0 && store.c === '', JSON.stringify(store));
  const prompts = [];
  dp.on('dialog', async (d) => { prompts.push(d.type()); await d.accept(); });
  await dp.reload();
  await dp.locator('.about').waitFor();
  check('reloading the tab restores the draft', (await dp.locator('h2').innerText()) === 'Draft that must survive' && (await dp.locator('#ids-status').innerText()).includes('unsaved changes'));
  prompts.length = 0;
  await dp.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 300));
  check('closing the tab with unsaved changes asks first (beforeunload)', prompts.includes('beforeunload'), prompts.join(','));
  await dctx.close();

  const clean = await ctx.newPage();
  clean.on('dialog', (d) => d.accept());
  await clean.goto(origin + '/');
  await clean.evaluate(() => sessionStorage.clear());
  await clean.reload();
  await clean.getByRole('button', { name: 'New' }).click();
  await clean.getByLabel('Title').fill('x');
  await clean.waitForTimeout(500);
  const hadDraft = await clean.evaluate(() => sessionStorage.length === 1);
  await clean.getByRole('button', { name: 'New' }).click();
  await clean.waitForTimeout(500);
  check('New clears the draft', hadDraft && await clean.evaluate(() => sessionStorage.length === 0));

  // ---- first-time-user fixes: what an IDS is, names that follow, "number" for a space, what an edit changed ------------
  {
    const fctx = await newContext({ width: 1280, height: 900 });
    const fp = await fctx.newPage();
    fp.on('pageerror', (e) => pageErrors.push(String(e)));
    await fp.goto(origin + '/');
    check('the empty page says in one sentence what an IDS file is, with an example, and what the page does', /^An IDS file lists what a building model must contain, for example that every door has a fire rating; here you check that such a file is valid, check a model against it, and write one\.$/.test(await fp.locator('#what-is-ids').innerText()));
    await fp.getByRole('button', { name: 'New' }).click();
    await fp.getByLabel('Title').fill('Names');
    const fspec = fp.locator('.page-specs > li.spec');
    const fadd = async (how) => { const n = await fspec.count(); await fp.getByRole('button', { name: 'Add a specification' }).click(); await fp.getByRole('group', { name: 'Start a specification from' }).getByRole('button', { name: how }).click(); await fp.waitForFunction((k) => document.querySelectorAll('.page-specs > li.spec').length > k, n); };
    await fadd('Elements must have a name');
    const fs0 = fspec.nth(0);
    const fname = fs0.getByLabel('Name', { exact: true });
    check('a new specification is named from what it says, and made optional with all three IFC versions', (await fname.inputValue()) === 'Spaces have a name' && (await fs0.getByRole('radio', { name: /^That is fine/ }).isChecked()) && (await fs0.locator('details.more').last().locator('summary').click().then(() => fs0.getByLabel('IFC2X3', { exact: true }).isChecked())) && (await fs0.getByLabel('IFC4', { exact: true }).isChecked()) && (await fs0.getByLabel('IFC4X3_ADD2', { exact: true }).isChecked()));
    check('the choice "If the model has no space" is in plain view', await fs0.getByText('If the model has no spaces').isVisible());
    const fclass = fs0.getByRole('combobox', { name: 'IFC class', exact: true });
    await fclass.fill('door'); await fp.locator('[role=option]').first().waitFor(); await fclass.press('Enter');
    check('while the name is the generated one it follows the content: changing the class changes the name', (await fname.inputValue()) === 'Doors have a name', await fname.inputValue());
    await fname.fill('Door naming');
    await fclass.fill('window'); await fp.locator('[role=option]').first().waitFor(); await fclass.press('Enter');
    check('once a name is typed it is never touched', (await fname.inputValue()) === 'Door naming', await fname.inputValue());
    // "type mark" for a space finds Reference, which the standard defines as the reference of the type (a room number is the Name)
    await fclass.fill('space'); await fp.locator('[role=option]').first().waitFor(); await fclass.press('Enter');
    const must = fs0.getByRole('region', { name: 'Must have' });
    await must.getByRole('button', { name: 'Add an item to Must have' }).click();
    await must.getByRole('button', { name: 'Property', exact: true }).click();
    const fprop = must.locator('li.facet').nth(1);
    await pick(fprop, 'Property set', 'space common');
    const pbox = fprop.getByRole('combobox', { name: 'Property', exact: true });
    await pbox.fill('type mark');
    await fprop.locator('[role=option]').first().waitFor();
    const offered = await fprop.locator('[role=option]').allInnerTexts();
    check('typing "type mark" for a space offers Reference, with what it means (the reference of the type, not a room number), and the field with text in it never says "Fill this in"', offered.some((t) => /^Reference\n[\s\S]*The reference of the type[\s\S]*a room number is the Name/.test(t)) && !(await fprop.innerText()).includes('Fill this in'), offered.join(' | '));
    await pbox.fill('zzz');
    await fp.waitForTimeout(200);
    const said = await fprop.locator('.msg, .hint').allInnerTexts();
    check('a name that is not in the standard set is said at the field before it is left, in plain words', said.some((t) => /^Pset_SpaceCommon has no property called zzz\. Standard ones are: .*Reference.*\. Use a custom property set for your own properties\.$/.test(t)), said.join(' | '));
    await pbox.press('Tab');
    check('and after it is left', (await fprop.innerText()).includes('Pset_SpaceCommon has no property called zzz.'));
    // what an edit did to the result
    await fp.locator('input[type=file]').nth(1).setInputFiles(ifc);
    await fclass.fill('wall'); await fp.locator('[role=option]').first().waitFor(); await fclass.press('Enter');
    await pick(fprop, 'Property set', 'wall common');
    await pick(fprop, 'Property', 'fire r');
    await fs0.getByRole('button', { name: /^Done editing/ }).first().click();
    await fp.locator('.title-block[data-kind="run"] .headline').waitFor({ timeout: 60000 });
    await fs0.getByRole('button', { name: /^Edit / }).click();
    await pick(fprop, 'Property', 'acoustic');
    await fs0.getByRole('button', { name: /^Done editing/ }).first().click();
    await fs0.locator('.change-line').waitFor({ timeout: 30000 });
    check('after Done the row says what changed, in one line, next to it and in view', /^Now fails: 1 element/.test(await fs0.locator('.change-line').innerText()) && (await fs0.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })), await fs0.locator('.change-line').innerText());
    // the line is about one edit: it goes when the next edit starts, and deleting the specification being edited leaves none behind
    await fadd('Elements must have a material');
    check('the line about an edit is taken away when another specification is opened for editing', (await fp.locator('.change-line').count()) === 0);
    await fspec.nth(1).getByRole('button', { name: /^Delete / }).click();
    await fp.waitForFunction(() => document.querySelectorAll('.page-specs > li.spec').length === 1);
    await fp.locator('.title-block[data-kind="run"] .headline').waitFor({ timeout: 60000 });
    await fp.waitForTimeout(500);
    check('deleting the specification that was being edited: no line about it appears anywhere, and the page has no error', (await fp.locator('.change-line').count()) === 0 && pageErrors.length === 0, pageErrors.join(' | '));
    await fctx.close();
  }

  // ---- what a new specification writes by default: the class and its subtypes in every ticked version; a list of the person's own is kept ----
  {
    const dctx = await newContext({ width: 1280, height: 900 });
    const dp = await dctx.newPage();
    dp.on('pageerror', (e) => pageErrors.push(String(e)));
    await dp.goto(origin + '/');
    await dp.getByRole('button', { name: 'New' }).click();
    await dp.getByLabel('Title').fill('Defaults');
    const dspec = dp.locator('.page-specs > li.spec');
    const dadd = async (how) => { const n = await dspec.count(); await dp.getByRole('button', { name: 'Add a specification' }).click(); await dp.getByRole('group', { name: 'Start a specification from' }).getByRole('button', { name: how }).click(); await dp.waitForFunction((k) => document.querySelectorAll('.page-specs > li.spec').length === k + 1, n); };
    const saved = async () => { await dp.locator('.verdict.pass .verdict-word', { hasText: 'Valid' }).waitFor({ timeout: 30000 }); const [d] = await Promise.all([dp.waitForEvent('download'), dp.getByRole('button', { name: 'Download .ids' }).click()]); return fs.readFileSync(await d.path(), 'utf8'); };
    const listed = (xml, n) => [...xml.split('<specification ')[n + 1].split('</applicability>')[0].matchAll(/<xs:enumeration value="([^"]+)"/g)].map((m) => m[1]);
    await dadd('Elements must have a classification');
    const d0 = dspec.nth(0);
    await d0.locator('.subtype-choice').waitFor({ timeout: 30000 });
    const doors = await saved();
    check('a new specification for doors ticks IFC2X3, IFC4 and IFC4X3_ADD2 and is written for IFCDOOR and IFCDOORSTANDARDCASE, a class of IFC4 alone: an IFC4 model of standard-case doors is covered',
      /ifcVersion="IFC2X3 IFC4 IFC4X3_ADD2"/.test(doors) && JSON.stringify(listed(doors, 0)) === JSON.stringify(['IFCDOOR', 'IFCDOORSTANDARDCASE']), JSON.stringify(listed(doors, 0)));
    check('the sentence and the form say so: "including door standard case", and the choice to include the subtypes is ticked and names it',
      (await d0.locator('.spec-words').innerText()) === 'Every door, including door standard case, must have a classification in Uniclass 2015.' && /^Include the subtypes: door standard case$/.test((await d0.locator('.subtype-choice').innerText()).trim()) && (await d0.locator('.subtype-choice input').isChecked()), await d0.locator('.subtype-choice').innerText());
    check('the choice about a model with none is asked in words that read: "If the model has no doors", "applies to all doors the model has"',
      (await d0.getByText('If the model has no doors').isVisible()) && (await d0.locator('.occurs').innerText()).includes('The specification applies to all doors the model has. A model with none passes.') && !/every doors|one doors/.test(await d0.locator('.occurs').innerText()), (await d0.locator('.occurs').innerText()).replace(/\n/g, ' | '));
    // "One of a list" opens the list as it is written; a class added to it by hand stays, and nothing is brought in beside it
    const applies = d0.getByRole('region', { name: 'Applies to' });
    await applies.getByLabel('IFC class: accepted values').selectOption('list');
    const values = applies.getByLabel('IFC class: values');
    await values.waitFor({ timeout: 10000 });
    check('choosing "One of a list" for a class with its subtypes opens the list as it is written, both classes, not the class alone', (await values.inputValue()) === 'IFCDOOR\nIFCDOORSTANDARDCASE', JSON.stringify(await values.inputValue()));
    await values.fill('IFCDOOR\nIFCDOORSTANDARDCASE\nIFCWINDOW');
    await dp.waitForTimeout(600);
    const own = await saved();
    check('a class added to the list by hand stays, the list stays a list, nothing is added beside it, and the name says it is more than doors',
      JSON.stringify(listed(own, 0)) === JSON.stringify(['IFCDOOR', 'IFCDOORSTANDARDCASE', 'IFCWINDOW']) && (await values.isVisible()) && (await d0.locator('.subtype-choice').count()) === 0 && (await d0.getByLabel('Name', { exact: true }).inputValue()) === 'Doors and 2 other classes are classified in Uniclass 2015',
      `${JSON.stringify(listed(own, 0))} | ${await d0.getByLabel('Name', { exact: true }).inputValue()}`);
    await d0.getByRole('button', { name: /^Done editing/ }).first().click();
    // a list typed by hand that happens to be a class and one of its subtypes is kept as typed
    await dadd('An empty specification');
    const d1 = dspec.nth(1);
    const a1 = d1.getByRole('region', { name: 'Applies to' });
    await a1.getByRole('button', { name: 'Add an item to Applies to' }).click();
    await a1.getByRole('button', { name: 'Type of element', exact: true }).click();
    await a1.getByLabel('IFC class: accepted values').selectOption('list');
    await a1.getByLabel('IFC class: values').fill('IFCWALL\nIFCWALLSTANDARDCASE');
    const m1 = d1.getByRole('region', { name: 'Must have' });
    await m1.getByRole('button', { name: 'Add an item to Must have' }).click();
    await m1.getByRole('button', { name: 'Material', exact: true }).click();
    await dp.waitForTimeout(800);
    const typed = await saved();
    check('a list typed by hand, IFCWALL and IFCWALLSTANDARDCASE, is written as typed: IFCWALLELEMENTEDCASE is not added to it and it is still shown as the list it is',
      JSON.stringify(listed(typed, 1)) === JSON.stringify(['IFCWALL', 'IFCWALLSTANDARDCASE']) && (await a1.getByLabel('IFC class: values').isVisible()) && (await a1.getByLabel('IFC class: values').inputValue()) === 'IFCWALL\nIFCWALLSTANDARDCASE', JSON.stringify(listed(typed, 1)));
    await dctx.close();
  }

  // ---- the network ---------------------------------------------------------
  check('no request to anywhere but the local server', blocked.length === 0, `blocked=${JSON.stringify(blocked)} local=${local.length}`);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`assertions passed: ${passed}, failed: ${failed}, total: ${passed + failed}`);
process.exit(failed ? 1 : 0);
