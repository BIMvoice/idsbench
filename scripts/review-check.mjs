/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A third browser script: what the file is that the user gets, what happens when things change under a run, what
// survives a reload, what odd input does, and the three journeys by keyboard alone. Headless Chromium against dist/,
// every request that is not to the local server blocked. scripts/ASSERTIONS.md lists what it asserts.
// Usage: node scripts/review-check.mjs <clone of buildingSMART/IDS> [a large IFC model]
// Files it generates and downloads go to .scratch/review-check/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const [clone, largeModel] = process.argv.slice(2);
if (!clone) throw new Error('usage: review-check.mjs <clone of buildingSMART/IDS> [a large IFC model]');
const dist = path.resolve('dist');
const out = path.resolve('.scratch/review-check');
fs.rmSync(out, { recursive: true, force: true });
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
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' | ' + String(extra).slice(0, 400) : ''}`); };
const write = (name, content) => { const p = path.join(out, name); fs.writeFileSync(p, content); return p; };
/** The mark the page puts on itself for the text it shows (src/ui/page/TitleBlock.tsx). */
const mark = (text) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return `${text.length}-${(h >>> 0).toString(36)}`; };
const engine = (f) => JSON.parse(execFileSync(path.resolve('node_modules/.bin/vite-node'), ['scripts/engine-findings.ts', f], { encoding: 'utf8' }).split('@@')[1]);

// ---- inputs -----------------------------------------------------------------
const NS = 'http://standards.buildingsmart.org/IDS';
const wall = (i, name = 'Waldo') => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'${name}',$,$,$,$,$,$);\n`;
const ifcText = (body, schema = 'IFC4') => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
const nameIs = (v) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements>`;
const spec = (name, cls, req = '', occurs = 'minOccurs="1" maxOccurs="unbounded"') => `    <specification name="${name}" ifcVersion="IFC4">\n      <applicability ${occurs}><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability>\n      ${req}\n    </specification>`;
const idsText = (specs, nl = '\n') => [`<?xml version="1.0" encoding="utf-8"?>`, `<!-- kept: a note at the top -->`, `<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd">`, `  <info>`, `    <title>Review</title>`, `  </info>`, `  <specifications>`, ...specs.flatMap((s, i) => [`    <!-- kept: above specification ${i + 1} -->`, s]), `  </specifications>`, `</ids>`, ''].join('\n').replace(/\n/g, nl);

const twoWalls = write('two-walls.ifc', ifcText(wall(1) + wall(2)));
const wilmaWalls = write('wilma-walls.ifc', ifcText(wall(1, 'Wilma') + wall(2, 'Wilma')));
const threeSpecs = [spec('Walls are named Waldo', 'IFCWALL', nameIs('Waldo')), spec('Walls are named Wilma', 'IFCWALL', `<!-- inside the second -->${nameIs('Wilma')}`), spec('No doors', 'IFCDOOR', '', 'minOccurs="0" maxOccurs="0"')];
const reviewIds = write('review.ids', idsText(threeSpecs));
const crlfBom = write('crlf-bom.ids', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(idsText(threeSpecs, '\r\n'))]));
const otherIds = write('other.ids', idsText([spec('Only one', 'IFCWALL', nameIs('Waldo'))]));
const latin1 = write('latin1.ids', Buffer.from(idsText([spec('Mur en béton', 'IFCWALL', nameIs('Béton'))]).replace('encoding="utf-8"', 'encoding="ISO-8859-1"'), 'latin1'));
const betonWalls = write('beton.ifc', Buffer.from(ifcText(wall(1, 'B\\X\\E9ton')), 'latin1'));
const badUtf8 = write('bad-utf8.ids', Buffer.from(idsText([spec('Mur en béton', 'IFCWALL', nameIs('Béton'))]), 'latin1'));
const xsdProblem = path.join('packages/check/test/fixtures/corpus/audit-repo/InvalidFiles/xsdFailure.ids');
const official = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.ids') && !f.name.startsWith('invalid-')) official.push(p); } };
walk(clone);
official.sort();

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  const blocked = [];
  let workerDelay = 0;
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (workerDelay && /\/assets\/worker-/.test(u)) await new Promise((r) => setTimeout(r, workerDelay));
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  // The watch of browser-check.mjs, extended: a result on screen must be of the text on the page (data-of against
  // data-doc), of the model in the model box (data-of-model against data-model), and each row that shows a state
  // must show the state the run gave to the specification of that name (data-result-of against the row's name).
  await ctx.addInitScript(() => {
    window.__stale = [];
    window.__seen = 0;
    const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
    const look = () => {
      const pageEl = document.querySelector('.page');
      if (!pageEl) return;
      window.__seen++;
      const doc = pageEl.getAttribute('data-doc'), model = pageEl.getAttribute('data-model');
      for (const el of document.querySelectorAll('.title-block[data-of], .page-specs[data-of]')) {
        const holdsResult = el.matches('.page-specs') ? el.querySelector('.state.pass, .state.fail, .state.nothing, .state.unchecked') : el.querySelector('.verdict.pass, .verdict.fail, .verdict.incomplete');
        if (!holdsResult) continue;
        if (el.getAttribute('data-of') !== doc) window.__stale.push(`${el.className}: result of text ${el.getAttribute('data-of')} shown while the document is ${doc}`);
        const isRun = el.matches('.page-specs') || el.getAttribute('data-kind') === 'run';
        if (isRun && el.getAttribute('data-of-model') !== model) window.__stale.push(`${el.className}: result of model ${el.getAttribute('data-of-model')} shown while the model is ${model}`);
      }
      for (const row of document.querySelectorAll('.page-specs > .spec')) {
        const state = row.querySelector(':scope > .spec-head > .state.pass, :scope > .spec-head > .state.fail, :scope > .spec-head > .state.nothing, :scope > .spec-head > .state.unchecked');
        if (!state) continue;
        const of = row.getAttribute('data-result-of'), own = norm(row.querySelector(':scope > .spec-head > .spec-name')?.textContent);
        if (norm(of) !== own) window.__stale.push(`row "${own}" shows the state of "${of}"`);
      }
      const rec = document.querySelector('.title-block[data-kind="run"] .record');
      const box = document.querySelectorAll('.drops .fname');
      if (rec && box.length === 2 && !rec.textContent.includes(box[1].textContent.trim())) window.__stale.push(`the record names another model than ${box[1].textContent}`);
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const page = await ctx.newPage();
  const pageErrors = [], dialogs = [];
  let acceptDialogs = true;
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await (acceptDialogs ? d.accept() : d.dismiss()).catch(() => {}); });
  const stale = [];
  let seen = 0;
  const collect = async (p = page) => { const r = await p.evaluate(() => ({ s: window.__stale.splice(0), n: window.__seen })).catch(() => ({ s: [], n: 0 })); stale.push(...r.s); seen += r.n; };

  const idsInput = page.locator('input[type=file]').nth(0);
  const ifcInput = page.locator('input[type=file]').nth(1);
  const fresh = async () => { await collect(); await page.evaluate(() => sessionStorage.clear()).catch(() => {}); await page.goto(origin + '/'); dialogs.length = 0; };
  const shows = (text, timeout = 20000) => page.locator(`.page[data-doc="${mark(text)}"]`).waitFor({ timeout });
  const status = () => page.locator('#ids-status').innerText();
  const word = () => page.locator('.verdict-word').innerText().catch(() => '');
  const specs = page.locator('.page-specs > .spec');
  const runVerdict = page.locator('.title-block[data-kind="run"] .verdict');
  const headline = page.locator('.title-block .headline');
  const validStamp = page.locator('.verdict.pass, .verdict.incomplete').filter({ hasText: 'Valid' });
  const dlButton = page.getByRole('button', { name: 'Download .ids', exact: true });
  const download = async (button, name, p = page) => {
    const dl = p.waitForEvent('download');
    await p.getByRole('button', { name: button, exact: true }).click();
    const d = await dl;
    const to = path.join(out, name);
    await d.saveAs(to);
    return { path: to, bytes: fs.readFileSync(to), text: fs.readFileSync(to, 'utf8'), file: d.suggestedFilename() };
  };
  const dropOnPage = async (files) => {
    const payload = files.map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
    await page.evaluate((payload) => {
      const dt = new DataTransfer();
      for (const p of payload) dt.items.add(new File([Uint8Array.from(atob(p.b64), (c) => c.charCodeAt(0))], p.name));
      const fire = (type) => document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire('dragenter'); fire('dragover'); fire('drop');
    }, payload);
  };
  const stateOf = async (i) => (await specs.nth(i).locator(':scope > .spec-head > .state').innerText().catch(() => '')).trim();

  // ---- A1: an opened file that is not changed is downloaded as it is ---------------------------
  // Chromium stops handing out downloads to one tab after about ten in a row, so the files go through a new tab every eight.
  const notSame = [], noDownload = [];
  const t0 = Date.now();
  for (let at = 0; at < official.length; at += 8) {
    const actx = await browser.newContext({ acceptDownloads: true });
    await actx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue(); blocked.push(u); return route.abort(); });
    const ap = await actx.newPage();
    ap.on('pageerror', (e) => pageErrors.push(String(e)));
    await ap.goto(origin + '/');
    const button = ap.getByRole('button', { name: 'Download .ids', exact: true });
    for (const f of official.slice(at, at + 8)) {
      const bytes = fs.readFileSync(f);
      await ap.locator('input[type=file]').nth(0).setInputFiles(f);
      await ap.locator(`.page[data-doc="${mark(bytes.toString('utf8').replace(/^\uFEFF/, ''))}"]`).waitFor({ timeout: 20000 });
      await ap.locator('#ids-status .file-name').filter({ hasText: path.basename(f) }).waitFor();
      // Download may be off for a moment only if the form's own rules object; then the engine's answer is waited for once.
      if (await button.isDisabled()) await ap.locator('.verdict.pass, .verdict.fail, .verdict.incomplete').first().waitFor({ timeout: 30000 });
      if (await button.isDisabled()) { noDownload.push(`${path.relative(clone, f)}: ${await ap.locator('#ids-reason').innerText()}`); continue; }
      const d = await download('Download .ids', 'a1.ids', ap);
      if (!d.bytes.equals(bytes) || d.file !== path.basename(f)) notSame.push(path.relative(clone, f));
      if ((await ap.locator('#ids-status').innerText()).includes('unsaved')) notSame.push(`${path.relative(clone, f)} (marked unsaved)`);
    }
    await actx.close();
  }
  console.log(`A1: ${official.length} valid official files opened and downloaded without a change in ${((Date.now() - t0) / 1000).toFixed(0)} s; identical: ${official.length - notSame.length - noDownload.length}; different: ${notSame.length}; Download off: ${noDownload.length}`);
  for (const l of noDownload.slice(0, 20)) console.log(`   Download off: ${l}`);
  check(`each of the ${official.length} valid official IDS files, opened and not changed, is downloaded byte for byte as it was opened`, official.length >= 319 && notSame.length === 0 && noDownload.length === 0, [...notSame, ...noDownload].slice(0, 3).join(' ; '));

  // ---- A2, A3: one change, and the change taken back -------------------------------------------
  const original = fs.readFileSync(reviewIds, 'utf8');
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await shows(original);
  await validStamp.waitFor();
  await page.getByRole('button', { name: 'Edit Walls are named Wilma' }).click();
  const nameField = specs.nth(1).getByLabel('Name', { exact: true });
  await nameField.fill('Walls are named Wilma, all of them');
  await page.locator('#ids-status .unsaved').waitFor();
  const note = await page.locator('#save-note').innerText();
  check('a change to a specification that holds a comment says, before Download, that writing it again leaves out that comment and that the rest of the file is kept', /^Writing specification 2 \("Walls are named Wilma, all of them"\) again will leave out: 1 comment\. The rest of the file is saved as it was opened\.$/.test(note), note);
  await validStamp.waitFor({ timeout: 20000 });
  const edited = await download('Download .ids', 'review-edited.ids');
  const from = original.indexOf('    <specification name="Walls are named Wilma"'), to = original.indexOf('    <!-- kept: above specification 3 -->');
  const head = original.slice(0, from), tail = original.slice(to);
  const middle = edited.text.slice(head.length, edited.text.length - tail.length);
  check('one change to one specification: every character before and after that specification is the opened file\'s own', edited.text.startsWith(head) && edited.text.endsWith(tail) && /^    <specification name="Walls are named Wilma, all of them" ifcVersion="IFC4">[\s\S]*<\/specification>\n$/.test(middle) && !middle.includes('<!--'), middle.slice(0, 120));
  check('...the comments at the top, above each specification and in the untouched ones are still there, and the engine accepts the file', ['<!-- kept: a note at the top -->', '<!-- kept: above specification 1 -->', '<!-- kept: above specification 2 -->', '<!-- kept: above specification 3 -->'].every((c) => edited.text.includes(c)) && engine(edited.path).valid === true);
  check('after the download the page shows the saved file: no unsaved changes, no note', !(await status()).includes('unsaved') && (await page.locator('#save-note').count()) === 0);

  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await shows(original);
  await page.getByRole('button', { name: 'Edit Walls are named Waldo' }).click();
  await specs.nth(0).getByLabel('Name', { exact: true }).fill('Walls are named Waldo!');
  await page.locator('#ids-status .unsaved').waitFor();
  await specs.nth(0).getByLabel('Name', { exact: true }).fill('Walls are named Waldo');
  await shows(original);
  check('a change typed back: the page shows the opened file again, with no unsaved mark and no note', !(await status()).includes('unsaved') && (await page.locator('#save-note').count()) === 0 && /\(\d/.test(await status()), await status());
  await validStamp.waitFor({ timeout: 20000 });
  const back = await download('Download .ids', 'review-back.ids');
  check('...and Download gives the opened file byte for byte', back.bytes.equals(fs.readFileSync(reviewIds)));

  // CRLF and a byte order mark survive a change; so does everything outside the changed specification
  const crlfText = fs.readFileSync(crlfBom, 'utf8').replace(/^﻿/, '');
  await fresh();
  await idsInput.setInputFiles(crlfBom);
  await shows(crlfText);
  await page.getByRole('button', { name: 'Edit No doors' }).click();
  await specs.nth(2).getByLabel('Name', { exact: true }).fill('No doors at all');
  await page.locator('#ids-status .unsaved').waitFor();
  await validStamp.waitFor({ timeout: 20000 });
  const crlfOut = await download('Download .ids', 'crlf-bom-edited.ids');
  const cut = crlfText.indexOf('    <specification name="No doors"');
  check('a file with a byte order mark and CRLF line ends keeps both after a change, in the changed specification too', crlfOut.bytes[0] === 0xef && crlfOut.bytes[1] === 0xbb && crlfOut.bytes[2] === 0xbf && crlfOut.text.replace(/^﻿/, '').startsWith(crlfText.slice(0, cut)) && !/[^\r]\n/.test(crlfOut.text) && crlfOut.text.includes('<specification name="No doors at all" ifcVersion="IFC4">\r\n'), JSON.stringify(crlfOut.text.slice(cut, cut + 90)));

  // A problem that is in the file's own text, not in what it says: nothing in a form reaches it
  const xsdText = fs.readFileSync(xsdProblem, 'utf8');
  await fresh();
  await idsInput.setInputFiles(xsdProblem);
  await shows(xsdText);
  await page.locator('.to-fix[data-fixes="ready"]').waitFor({ timeout: 30000 });
  const again = page.getByRole('button', { name: 'Write this specification again in the standard form' });
  check('an attribute and an element the standard does not know: the fix offered is to write that specification again', (await again.count()) >= 1 && (await word()) === 'Not valid', await page.locator('.fix-list').innerText());
  await again.first().click();
  await validStamp.waitFor({ timeout: 30000 });
  const rewritten = await download('Download .ids', 'xsd-fixed.ids');
  check('...one press makes the file valid, it can be undone, and the saved file is one the engine accepts', engine(rewritten.path).valid === true && !rewritten.text.includes('invalidAttribute'));

  // A file in another encoding than UTF-8
  await fresh();
  await idsInput.setInputFiles(latin1);
  await ifcInput.setInputFiles(betonWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  check('a file written in ISO-8859-1 is read in that encoding: its letters are on the page, the run compares them with the model\'s, and the page says a change is saved as UTF-8', (await specs.first().locator('.spec-name').innerText()) === 'Mur en béton' && (await word()) === 'Pass' && /written in ISO-8859-1\. If you change it here, it is saved as UTF-8\./.test(await page.locator('#encoding-note').innerText()), `${await word()} | ${await headline.innerText()}`);
  const latinSame = await download('Download .ids', 'latin1-same.ids');
  check('...not changed, it is downloaded as its own bytes', latinSame.bytes.equals(fs.readFileSync(latin1)));
  await page.getByRole('button', { name: 'Edit Mur en béton' }).click();
  await specs.first().getByLabel('Name', { exact: true }).fill('Mur en béton armé');
  await page.locator('#ids-status .unsaved').waitFor();
  await runVerdict.waitFor({ timeout: 60000 });
  const latinEdited = await download('Download .ids', 'latin1-edited.ids');
  check('...changed, it is saved as UTF-8 and says so in its first line, with every letter intact', latinEdited.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && latinEdited.text.includes('name="Mur en béton armé"') && latinEdited.text.includes('<simpleValue>Béton</simpleValue>') && engine(latinEdited.path).valid === true);
  await fresh();
  await idsInput.setInputFiles(badUtf8);
  await page.locator('.file-refusal').waitFor();
  check('a file that says UTF-8 and is not: refused with the reason, never opened with letters replaced', /says it is written in UTF-8 but holds bytes that are not/.test(await page.locator('.file-refusal').innerText()) && (await specs.count()) === 0);

  // ---- B: Undo does not take later work with it ------------------------------------------------
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await shows(original);
  await page.getByRole('button', { name: 'Edit No doors' }).click();
  await page.getByRole('button', { name: 'Delete No doors' }).click();
  await page.getByRole('button', { name: 'Undo' }).waitFor();
  await page.getByRole('button', { name: 'Edit Walls are named Waldo' }).click();
  await specs.nth(0).getByLabel('Name', { exact: true }).fill('Typed after the delete');
  await page.waitForTimeout(200);
  check('Undo is withdrawn once something is typed after the one-press change, so it cannot take that typing with it', (await page.getByRole('button', { name: 'Undo' }).count()) === 0 && (await specs.count()) === 2 && (await specs.nth(0).locator('.spec-name').innerText()) === 'Typed after the delete');

  // ---- C8: things changing under a run ---------------------------------------------------------
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  check('three specifications, two walls named Waldo: Pass, Fail, Pass, each row with the state of its own specification', (await stateOf(0)) === 'Pass' && (await stateOf(1)) === 'Fail' && (await stateOf(2)) === 'Pass' && (await specs.nth(1).getAttribute('data-result-of')) === 'Walls are named Wilma');
  // reorder: the rows change place, and each still carries its own result
  await page.getByRole('button', { name: 'Edit Walls are named Wilma' }).click();
  await page.getByRole('button', { name: 'Move Walls are named Wilma up' }).click();
  await page.getByRole('button', { name: 'Done editing Walls are named Wilma' }).click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('moving a specification: the result follows the specification, not the place', (await specs.nth(0).locator('.spec-name').innerText()) === 'Walls are named Wilma' && (await stateOf(0)) === 'Fail' && (await stateOf(1)) === 'Pass' && (await stateOf(2)) === 'Pass');
  const moved = await download('Download .ids', 'review-moved.ids');
  check('...and the saved file holds the specifications in the new order, each with the comment written above it, and nothing rewritten', moved.text.indexOf('<!-- kept: above specification 2 -->') < moved.text.indexOf('<!-- kept: above specification 1 -->') && moved.text.includes('<!-- inside the second -->') && moved.text.length === original.length);
  // delete the specification whose result is open
  await specs.nth(0).locator('details.fails summary').click();
  await page.getByRole('button', { name: 'Edit Walls are named Wilma' }).click();
  await page.getByRole('button', { name: 'Delete Walls are named Wilma' }).click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('deleting the specification whose failing elements are open: its result goes with it and the two left keep theirs', (await specs.count()) === 2 && (await stateOf(0)) === 'Pass' && (await stateOf(1)) === 'Pass' && (await word()) === 'Pass' && (await page.locator('details.fails').count()) === 0);

  // quick typing in several fields with a model loaded
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Edit Walls are named Waldo' }).click();
  const valueField = specs.nth(0).locator('.facet-list[aria-label="Must have"] .value-field[aria-label="Value"] input[role=combobox]');
  const quickName = specs.nth(0).getByLabel('Name', { exact: true });
  const toEnd = (field) => field.evaluate((e) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
  await toEnd(quickName);
  await quickName.pressSequentially(' quickly', { delay: 8 });
  await valueField.click();
  await valueField.pressSequentially('Wilma', { delay: 8 });
  await toEnd(quickName);
  await quickName.pressSequentially(' again', { delay: 8 });
  check('while typing, the row being edited shows no result and the stamp is not a verdict of the older text', (await stateOf(0)) === 'Editing' && !['Pass', 'Fail'].includes(await word()), await word());
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('quick typing in several fields: the result that appears is of the last text (the first specification now fails)', (await stateOf(0)) === 'Fail' && (await specs.nth(0).locator('.spec-name').innerText()) === 'Walls are named Waldo quickly again' && (await page.locator('.title-block').getAttribute('data-of')) === (await page.locator('.page').getAttribute('data-doc')), `${await stateOf(0)} | ${await specs.nth(0).locator('.spec-name').innerText()} | ${await specs.nth(0).locator('.spec-words').innerText()}`);

  // replace the model during a run; replace the IDS during a run; load the example during a run
  await fresh();
  workerDelay = 1500;
  await idsInput.setInputFiles(reviewIds);
  await ifcInput.setInputFiles(twoWalls);
  await page.locator('.verdict-word', { hasText: 'Checking' }).waitFor();
  await ifcInput.setInputFiles(wilmaWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  check('replacing the model during a run: the result that appears is of the second model, named in the record', (await stateOf(0)) === 'Fail' && (await stateOf(1)) === 'Pass' && /Model\s+wilma-walls\.ifc/.test(await page.locator('.record').innerText()));
  await ifcInput.setInputFiles(twoWalls);
  await page.locator('.verdict-word', { hasText: 'Checking' }).waitFor();
  await idsInput.setInputFiles(otherIds);
  await runVerdict.waitFor({ timeout: 60000 });
  check('replacing the IDS file during a run: only the result of the second file appears', (await specs.count()) === 1 && (await stateOf(0)) === 'Pass' && /IDS file\s+other\.ids/.test(await page.locator('.record').innerText()));
  await ifcInput.setInputFiles(wilmaWalls);
  await page.locator('.verdict-word', { hasText: 'Checking' }).waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Try an example' }).click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('closing and loading the example during a run: the result is the example\'s, under the example\'s names', /IDS file\s+example-requirements\.ids/.test(await page.locator('.record').innerText()) && /Model\s+example-building\.ifc/.test(await page.locator('.record').innerText()) && !/wilma|other\.ids/.test(await page.locator('.record').innerText()), (await page.locator('.record').innerText()).replace(/\s+/g, ' '));
  workerDelay = 0;

  if (largeModel && fs.existsSync(largeModel)) {
    await fresh();
    await idsInput.setInputFiles(reviewIds);
    await validStamp.waitFor({ timeout: 20000 });
    const t1 = Date.now();
    await ifcInput.setInputFiles(largeModel);
    await page.locator('.verdict-word', { hasText: 'Checking' }).waitFor({ timeout: 20000 });
    // edit while the large model is being read
    await page.getByRole('button', { name: 'Edit No doors' }).click();
    await specs.nth(2).getByLabel('Name', { exact: true }).evaluate((e) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
    await specs.nth(2).getByLabel('Name', { exact: true }).pressSequentially(' anywhere', { delay: 5 });
    await page.getByRole('button', { name: /^Done editing/ }).first().click();
    await runVerdict.waitFor({ timeout: 180000 });
    const rec = await page.locator('.record').innerText();
    check(`a ${(fs.statSync(largeModel).size / 1048576).toFixed(0)} MB model, the IDS edited while it is being read: the one result that appears is of the edited text and that model`, (await specs.nth(2).locator('.spec-name').innerText()) === 'No doors anywhere' && rec.includes(path.basename(largeModel)) && /with unsaved changes/.test(rec) && (await page.locator('.title-block').getAttribute('data-of')) === (await page.locator('.page').getAttribute('data-doc')), `${((Date.now() - t1) / 1000).toFixed(1)} s`);
    // replace the large model with a small one during its run
    await ifcInput.setInputFiles(twoWalls);
    await runVerdict.waitFor({ timeout: 60000 });
    await ifcInput.setInputFiles(largeModel);
    await page.locator('.verdict-word', { hasText: 'Checking' }).waitFor({ timeout: 20000 });
    await ifcInput.setInputFiles(wilmaWalls);
    await runVerdict.waitFor({ timeout: 60000 });
    await page.waitForTimeout(3000);
    check('the large model replaced by a small one during its run: the small model\'s result appears and is not overwritten when the large one would have finished', /Model\s+wilma-walls\.ifc/.test(await page.locator('.record').innerText()) && (await stateOf(0)) === 'Fail');
  } else {
    console.log('SKIPPED the large-model races: no large model was given');
  }

  // ---- C10: an edit that makes the file invalid while a model is loaded, and back ---------------
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  let workers = 0;
  page.on('worker', (w) => { if (w.url().includes('/assets/worker-')) workers++; });
  await page.getByRole('button', { name: 'Edit Walls are named Waldo' }).click();
  const classField = specs.nth(0).locator('.facet-list[aria-label="Applies to"] input[role=combobox]').first();
  await classField.fill('IFCRABBIT');
  await classField.press('Tab');
  await page.locator('.verdict.fail .verdict-word', { hasText: 'Not valid' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  const states = [await stateOf(0), await stateOf(1), await stateOf(2)];
  check('an edit that makes the IDS file not valid with a model loaded: no Pass or Fail stays on the page, every row waits, and nothing is run', states.every((s) => s === 'Waiting') && (await page.locator('.state.pass, .state.fail, .verdict.pass').count()) === 0 && (await word()) === 'Not valid' && workers === 0, states.join(','));
  await page.getByRole('button', { name: 'Edit Walls are named Waldo' }).click();
  await classField.fill('IFCWALL');
  await classField.press('Tab');
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  await runVerdict.waitFor({ timeout: 60000 });
  check('...and made valid again: the model is run again by itself, without being chosen again', (await stateOf(0)) === 'Pass' && (await stateOf(1)) === 'Fail' && /Model\s+two-walls\.ifc/.test(await page.locator('.record').innerText()));

  // ---- C11: the draft -------------------------------------------------------------------------
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Edit No doors' }).click();
  await specs.nth(2).getByLabel('Name', { exact: true }).fill('No doors, reloaded');
  await page.waitForTimeout(700);
  const keys = await page.evaluate(() => ({ s: Object.keys(sessionStorage), l: localStorage.length, c: document.cookie }));
  await page.reload();
  await page.locator('#page-notice').waitFor();
  const restoredNote = await page.locator('#page-notice').innerText();
  check('reloading in the middle of a change with a model loaded: the change is back, and the page says the model has to be chosen again, by name', /^Your unsaved changes were restored\. The model two-walls\.ifc is not kept when the page is loaded again: choose it again to see its result\./.test(restoredNote) && (await specs.nth(2).locator('.spec-name').innerText()) === 'No doors, reloaded' && (await status()).includes('unsaved changes') && (await page.locator('.state.pass, .state.fail').count()) === 0, restoredNote);
  check('storage holds the draft and nothing else', keys.s.length === 1 && keys.s[0] === 'idsbench.write.draft' && keys.l === 0 && keys.c === '', JSON.stringify(keys));
  await validStamp.waitFor({ timeout: 20000 });
  const afterReload = await download('Download .ids', 'review-after-reload.ids');
  const cut3 = original.indexOf('    <specification name="No doors"');
  check('...and the file downloaded after the reload still holds everything outside the changed specification as it was opened, comments and all', afterReload.text.startsWith(original.slice(0, cut3)) && afterReload.text.includes('<!-- inside the second -->') && afterReload.text.includes('name="No doors, reloaded"') && engine(afterReload.path).valid === true);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  check('choosing the model again after the reload gives its result', (await stateOf(0)) === 'Pass' && (await stateOf(1)) === 'Fail');

  for (const [label, raw] of [
    ['cut off', '{"doc":{"info":{"title":"x"},"specifications":[{"uid":"a","name":"S"'],
    ['of another shape (a specification without its lists)', JSON.stringify({ doc: { info: { title: 'Old' }, specifications: [{ uid: 'u1', name: 'Old shape' }] }, fileName: null, savedXml: '' })],
    ['with a value that is not a value', JSON.stringify({ doc: { info: { title: 'Old', copyright: '', version: '', description: '', author: '', date: '', purpose: '', milestone: '' }, specifications: [{ uid: 'u1', name: 'S', ifcVersion: ['IFC4'], identifier: null, description: null, instructions: null, minOccurs: '1', maxOccurs: 'unbounded', applicability: [{ kind: 'entity', uid: 'f1', instructions: null, name: 'IFCWALL', predefinedType: null }], requirements: [], requirementsDescription: null }] }, fileName: null, savedXml: '' })],
  ]) {
    await fresh();
    const errorsBefore = pageErrors.length;
    await page.evaluate((raw) => sessionStorage.setItem('idsbench.write.draft', raw), raw);
    await page.reload();
    await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
    const said = await page.locator('#page-notice').innerText().catch(() => '');
    check(`a stored draft that is ${label}: the page loads, says the changes could not be restored, and works`, pageErrors.length === errorsBefore && /could not be read, so they were not restored/.test(said) && (await page.getByRole('button', { name: 'Try an example' }).count()) === 1, `${said} ${pageErrors.slice(errorsBefore).join(' ')}`);
  }
  // a draft from the build before this one: no opened text in it
  await fresh();
  await page.evaluate(() => sessionStorage.setItem('idsbench.write.draft', JSON.stringify({ doc: { info: { title: 'From the older build', copyright: '', version: '', description: '', author: '', date: '', purpose: '', milestone: '' }, specifications: [] }, fileName: 'older.ids', savedXml: '<ids/>' })));
  await page.reload();
  await page.locator('#page-notice').waitFor();
  check('a draft stored by the build before this one (without the opened text) is restored', (await page.locator('h2.doc-title').innerText()) === 'From the older build' && (await status()).includes('older.ids') && (await status()).includes('unsaved changes'));
  // New and Close over unsaved changes ask; refusing keeps the work
  acceptDialogs = false;
  dialogs.length = 0;
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  check('New and Close over unsaved changes each ask first, and answering no keeps the work', dialogs.length === 2 && dialogs.every((d) => d === 'confirm: You have unsaved changes. Discard them?') && (await page.locator('h2.doc-title').innerText()) === 'From the older build', dialogs.join(' ; '));
  acceptDialogs = true;

  // ---- F: odd input ----------------------------------------------------------------------------
  await fresh();
  await dropOnPage([twoWalls, reviewIds]);
  await runVerdict.waitFor({ timeout: 60000 });
  const modelFirst = await headline.innerText();
  await fresh();
  await dropOnPage([reviewIds, twoWalls]);
  await runVerdict.waitFor({ timeout: 60000 });
  check('both files dropped at once, the model first or the IDS file first: the same result', modelFirst === (await headline.innerText()) && /2 of 3/.test(modelFirst), modelFirst);
  await fresh();
  await dropOnPage([reviewIds, otherIds]);
  await page.locator('#page-notice').waitFor();
  const twoNote = await page.locator('#page-notice').innerText();
  check('two IDS files dropped at once: the first is opened and the page says by name that the other was not', twoNote.startsWith('2 IDS files arrived together. review.ids was opened; other.ids was not. The page holds one IDS file at a time.') && (await status()).includes('review.ids') && (await specs.count()) === 3, twoNote);
  await fresh();
  await dropOnPage([reviewIds, twoWalls, wilmaWalls]);
  await page.locator('#page-notice').waitFor();
  await runVerdict.waitFor({ timeout: 60000 });
  check('an IDS file and two models dropped at once: the first model is checked and the second is named as not taken', (await page.locator('#page-notice').innerText()).startsWith('2 models arrived together. two-walls.ifc was taken; wilma-walls.ifc was not.') && /Model\s+two-walls\.ifc/.test(await page.locator('.record').innerText()));
  await fresh();
  await idsInput.setInputFiles(reviewIds);
  await shows(original);
  await idsInput.setInputFiles(reviewIds);
  await validStamp.waitFor({ timeout: 20000 });
  check('the same file chosen twice: no question, no change, still not marked unsaved', dialogs.length === 0 && !(await status()).includes('unsaved') && (await specs.count()) === 3);
  const empty = write('empty.ids', '');
  await idsInput.setInputFiles(empty);
  await page.locator('.file-refusal').waitFor();
  check('a 0-byte file is refused with the reason and the document on the page stays', /empty\.ids was not opened\. This file is empty\./.test(await page.locator('.file-refusal').innerText()) && (await specs.count()) === 3);
  const huge = path.join(out, 'huge.ids');
  { const fd = fs.openSync(huge, 'w'); fs.writeSync(fd, '<?xml version="1.0"?><ids>'); fs.ftruncateSync(fd, 300 * 1024 * 1024); fs.closeSync(fd); }
  await idsInput.setInputFiles(huge);
  await page.locator('.file-refusal').filter({ hasText: 'huge.ids' }).waitFor({ timeout: 60000 });
  check('a 300 MB file given as the IDS file is refused in words without being read, and the document on the page stays', /huge\.ids was not opened\. This file is far too large to be an IDS file\./.test(await page.locator('.file-refusal').innerText()) && (await specs.count()) === 3);
  fs.rmSync(huge);

  // ---- E18: the report names the bytes it is about ------------------------------------------------
  await fresh();
  await idsInput.setInputFiles(crlfBom);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const rep = JSON.parse((await download('Download report', 'report.json')).text);
  check('the report states which IDS file and which model it describes: name, size in bytes and SHA-256 of each, equal to those of the files on disk', rep.ids.name === 'crlf-bom.ids' && rep.ids.bytes === fs.statSync(crlfBom).size && rep.ids.sha256 === sha(fs.readFileSync(crlfBom)) && rep.model.name === 'two-walls.ifc' && rep.model.bytes === fs.statSync(twoWalls).size && rep.model.sha256 === sha(fs.readFileSync(twoWalls)) && rep.edited === false && rep.run.specs.length === 3, JSON.stringify([rep.ids, rep.model]));
  await page.getByRole('button', { name: 'Edit No doors' }).click();
  await specs.nth(2).getByLabel('Name', { exact: true }).fill('No doors here');
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  await runVerdict.waitFor({ timeout: 60000 });
  const rep2 = JSON.parse((await download('Download report', 'report-edited.json')).text);
  const savedEdited = await download('Download .ids', 'crlf-bom-for-report.ids');
  check('...and for a changed document the hash in the report is the hash of the file Download then saves', rep2.edited === true && rep2.ids.sha256 !== rep.ids.sha256 && rep2.ids.sha256 === sha(savedEdited.bytes) && rep2.ids.bytes === savedEdited.bytes.length && rep2.model.sha256 === rep.model.sha256, JSON.stringify(rep2.ids));

  // ---- E16: the CSV in a spreadsheet ---------------------------------------------------------------
  const nasty = ['=HYPERLINK("http://example.invalid","x")', '+2.50 Level', '-wall; old', '@SUM(A1)', 'Wand "Süd", außen', 'x'.repeat(300)];
  const nastyIfc = write('nasty.ifc', ifcText(nasty.map((n, i) => wall(i + 1, n.replace(/'/g, "''").replace(/ü/g, '\\X\\FC').replace(/ß/g, '\\X\\DF'))).join('') + `#90=IFCWALL($,$,$,$,$,$,$,$,$);\n`));
  await fresh();
  await idsInput.setInputFiles(otherIds);
  await ifcInput.setInputFiles(nastyIfc);
  await runVerdict.waitFor({ timeout: 60000 });
  const csv = (await download('Download failing elements', 'nasty.csv')).text;
  const rowsOf = (text) => { const rows = []; let row = [], cell = '', q = false; const b = text.replace(/^﻿/, ''); for (let i = 0; i < b.length; i++) { const c = b[i]; if (q) { if (c === '"' && b[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\r' && b[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; } else cell += c; } return rows; };
  const csvRows = rowsOf(csv);
  const names = csvRows.slice(1).map((r) => r[6]);
  check('CSV: a name that a spreadsheet would run as a formula (=, +, -, @) is written with an apostrophe in front; other names, long ones and letters outside ASCII are as in the model; an element with no name and no GlobalId has empty cells', csvRows.length === 8 && names[0] === `'${nasty[0]}` && names[1] === `'${nasty[1]}` && names[2] === `'${nasty[2]}` && names[3] === `'${nasty[3]}` && names[4] === nasty[4] && names[5] === nasty[5] && names[6] === '' && csvRows[7][7] === '' && csvRows.every((r) => r.length === 11) && csvRows.slice(1).every((r) => r[0] === 'Element'), JSON.stringify(names.map((n) => n.slice(0, 30))));

  // ---- E17: one reason is read once, whatever value each element has of its own -------------------
  await specs.first().locator('details.fails summary').click();
  const groupHeads = await page.locator('.fail-group .group-reason').allInnerTexts();
  const firstGroup = page.locator('.fail-group').first();
  check('six walls that fail one requirement, each with a name of its own, are one group with the reason said once and each wall\'s own value in its row; the wall with no name is a group of its own; the counts add up to the seven that failed', groupHeads.length === 2 && /^6 elements: Attribute "Name" is "…", expected "Waldo"\. Each element's own value is in the last column\.$/.test(groupHeads[0]) && /^1 element: /.test(groupHeads[1]) && (await firstGroup.locator('tbody tr').count()) === 6 && (await firstGroup.locator('thead th').allInnerTexts()).join('|') === 'IFC class|Name|GlobalId|It has' && (await firstGroup.locator('tbody tr').nth(1).locator('td').nth(3).innerText()) === '+2.50 Level', groupHeads.join(' || '));

  // a result that fails without a single failing element
  await fresh();
  const needsDoor = write('needs-door.ids', idsText([spec('There is a door', 'IFCDOOR', nameIs('x'))]));
  await idsInput.setInputFiles(needsDoor);
  await ifcInput.setInputFiles(twoWalls);
  await runVerdict.waitFor({ timeout: 60000 });
  const nextStep = await page.locator('#next-step').innerText();
  check('a required specification that matches nothing: Fail, and the page does not say "Nothing failed"', (await word()) === 'Fail' && !/Nothing failed/.test(nextStep) && /^No single element failed: a specification failed as a whole, and its row says why\. Download failing elements gives it as a row/.test(nextStep) && (await page.getByRole('button', { name: 'Download failing elements' }).count()) === 1, nextStep);
  // The list for the people who model is not silent about it: a row of its own, marked in the first column, with no element in it.
  const wholeCsv = (await download('Download failing elements', 'whole.csv')).text;
  const wholeRows = rowsOf(wholeCsv);
  check('...and the CSV holds that specification as a row marked "Whole specification", with the reason and no element', wholeRows.length === 2 && wholeRows[1][0] === 'Whole specification' && wholeRows[1][1] === 'There is a door' && /needs at least one matching element, and the model has none/.test(wholeRows[1][3]) && wholeRows[1][5] === '' && wholeRows[1][6] === '' && wholeRows[1][7] === '' && wholeRows[1][2] === 'Every door must have the attribute Name set to "x". The model must contain at least one door.' && wholeRows[1][4] !== '', JSON.stringify(wholeRows[1]));

  // ---- E19: a specification that is not checked is not a failure, and the page, the CSV and the report count it alike ----
  // A model with a standard case door: the engine of this version reads it as a door, so a specification with a
  // predefined type beside the class is withheld (src/core/foldguard.ts).
  const line = (i, cls, name) => `#${i}=${cls}('${String(i).padStart(22, '0')}',$,'${name}',$,$,$,$,$,$);\n`;
  const caseDoor = write('case-door.ifc', ifcText(line(1, 'IFCDOORSTANDARDCASE', 'D1') + line(2, 'IFCDOOR', 'D2') + wall(3)));
  const withheldSpec = `    <specification name="Standard case doors of type DOOR" ifcVersion="IFC4">\n      <applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCDOORSTANDARDCASE</simpleValue></name><predefinedType><simpleValue>DOOR</simpleValue></predefinedType></entity></applicability>\n      ${nameIs('x')}\n    </specification>`;
  await fresh();
  await idsInput.setInputFiles(write('withheld-only.ids', idsText([withheldSpec, spec('Walls are named Waldo', 'IFCWALL', nameIs('Waldo'))])));
  await ifcInput.setInputFiles(caseDoor);
  await runVerdict.waitFor({ timeout: 60000 });
  const onlyStep = await page.locator('#next-step').innerText();
  check('a result whose only row that is not a Pass is withheld: Incomplete, the row is Not checked, no Download failing elements, and the one primary action is Download report',
    (await word()) === 'Incomplete' && (await stateOf(0)) === 'Not checked' && (await stateOf(1)) === 'Pass' && (await page.getByRole('button', { name: 'Download failing elements' }).count()) === 0
    && (await page.locator('.btn.primary').allInnerTexts()).join(',') === 'Download report' && /Download the report/.test(onlyStep) && !/Download failing elements/.test(onlyStep), `${await word()} | ${await stateOf(0)} | ${onlyStep}`);
  await fresh();
  await idsInput.setInputFiles(write('withheld-mixed.ids', idsText([withheldSpec, spec('Walls are named Wilma', 'IFCWALL', nameIs('Wilma')), spec('There is a slab', 'IFCSLAB', nameIs('x')), spec('Walls are named Waldo', 'IFCWALL', nameIs('Waldo'))])));
  await ifcInput.setInputFiles(caseDoor);
  await runVerdict.waitFor({ timeout: 60000 });
  const mixedStates = [await stateOf(0), await stateOf(1), await stateOf(2), await stateOf(3)];
  const mixedRows = rowsOf((await download('Download failing elements', 'withheld-mixed.csv')).text).slice(1);
  const mixedReport = JSON.parse((await download('Download report', 'withheld-mixed.json')).text);
  const reportRun = mixedReport.run ?? mixedReport;
  check('with a failure beside it: Fail, the rows are Not checked, Fail, Fail, Pass; the CSV marks one row Not checked, one Element and one Whole specification; the report counts the same',
    (await word()) === 'Fail' && mixedStates.join(',') === 'Not checked,Fail,Fail,Pass'
    && mixedRows.map((r) => `${r[0]}:${r[1]}`).join(' | ') === 'Not checked:Standard case doors of type DOOR | Element:Walls are named Wilma | Whole specification:There is a slab'
    && /cannot tell that class from its parent class IfcDoor/.test(mixedRows[0][3])
    && JSON.stringify(reportRun.counts) === JSON.stringify({ specifications: 4, passed: 1, failed: 2, notChecked: 1, nothingToCheck: 0 })
    && reportRun.specs.map((r) => r.state).join(',') === 'unchecked,fail,fail,pass' && typeof reportRun.specs[0].withheld === 'string',
    `${mixedStates.join(',')} | ${mixedRows.map((r) => `${r[0]}:${r[1]}`).join(' | ')} | ${JSON.stringify(reportRun.counts)}`);

  // ---- G: the three journeys without a mouse -----------------------------------------------------
  const kctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  await kctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue(); blocked.push(u); return route.abort(); });
  const kb = await kctx.newPage();
  kb.on('pageerror', (e) => pageErrors.push(String(e)));
  const cannot = [];
  /** Presses Tab (or Shift+Tab) until the element is focused. The mouse is never used. */
  const tabTo = async (locator, what, back = false) => {
    for (let i = 0; i < 400; i++) {
      if (await locator.first().evaluate((e) => e === document.activeElement).catch(() => false)) return true;
      await kb.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    }
    cannot.push(what);
    return false;
  };
  const kbButton = (name) => kb.getByRole('button', { name, exact: true });
  const chooseByKey = async (button, file) => { await tabTo(button, `reach ${file}`); const [fc] = await Promise.all([kb.waitForEvent('filechooser'), kb.keyboard.press('Enter')]); await fc.setFiles(file); };
  const saveByKey = async (button, name, what) => { await tabTo(button, what); const [d] = await Promise.all([kb.waitForEvent('download'), kb.keyboard.press('Enter')]); const to = path.join(out, name); await d.saveAs(to); return { path: to, text: fs.readFileSync(to, 'utf8') }; };

  // J1: a model against an IDS file, to a downloaded CSV
  await kb.goto(origin + '/');
  await chooseByKey(kbButton('Open'), reviewIds);
  await chooseByKey(kbButton('Choose a model'), twoWalls);
  await kb.locator('.title-block[data-kind="run"] .verdict').waitFor({ timeout: 60000 });
  const j1 = await saveByKey(kbButton('Download failing elements'), 'j1.csv', 'J1: Download failing elements');
  check('J1 by keyboard alone: open the IDS file, choose the model, download the failing elements', cannot.length === 0 && rowsOf(j1.text).length === 3 && rowsOf(j1.text)[1][0] === 'Element' && rowsOf(j1.text)[1][1] === 'Walls are named Wilma', cannot.join(', '));

  // J2: is this IDS valid, to a fixed file
  await kb.goto(origin + '/');
  const invalidOfficial = path.join(clone, 'Documentation/ImplementersDocumentation/TestCases/ids/invalid-prohibited_specifications_invalid_if_requirements_are_specified.ids');
  await chooseByKey(kbButton('Open'), invalidOfficial);
  await kb.locator('.to-fix[data-fixes="ready"]').waitFor({ timeout: 30000 });
  await tabTo(kbButton('Remove the 1 "Must have" item'), 'J2: the one-press fix');
  await kb.keyboard.press('Enter');
  await kb.locator('.verdict.pass, .verdict.incomplete').filter({ hasText: 'Valid' }).waitFor({ timeout: 30000 });
  const j2 = await saveByKey(kbButton('Download .ids'), 'j2.ids', 'J2: Download .ids', true);
  check('J2 by keyboard alone: open a file that is not valid, apply the fix, download a file the engine accepts', cannot.length === 0 && engine(j2.path).valid === true, cannot.join(', '));

  // J2 again, with a problem that has no one-press fix: Fix, type the correction, download
  await kb.goto(origin + '/');
  const rabbit = write('rabbit.ids', idsText([spec('Rabbits', 'IFCRABBIT', nameIs('x'))]));
  await chooseByKey(kbButton('Open'), rabbit);
  await kb.locator('.to-fix[data-fixes="ready"]').waitFor({ timeout: 30000 });
  await tabTo(kb.getByRole('button', { name: /^Fix: / }), 'J2: Fix');
  await kb.keyboard.press('Enter');
  const inField = await kb.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox' && document.activeElement.value === 'IFCRABBIT');
  await kb.keyboard.type('wall');
  await kb.keyboard.press('Enter');
  await kb.locator('.verdict.pass, .verdict.incomplete').filter({ hasText: 'Valid' }).waitFor({ timeout: 30000 });
  const j2b = await saveByKey(kbButton('Download .ids'), 'j2b.ids', 'J2: Download .ids after Fix', true);
  check('J2 by keyboard alone, no one-press fix: Fix puts the keyboard in the class field, typing "wall" and Enter corrects it, and the download is valid', cannot.length === 0 && inField && j2b.text.includes('<simpleValue>IFCWALL</simpleValue>') && engine(j2b.path).valid === true, cannot.join(', '));

  // J3: two specifications from patterns, and download
  await kb.goto(origin + '/');
  await tabTo(kbButton('New'), 'J3: New');
  await kb.keyboard.press('Enter');
  await kb.getByLabel('Title').and(kb.locator(':focus')).waitFor();
  await kb.keyboard.type('Made by keyboard');
  for (const pattern of ['Elements must have a property', 'Elements must not exist in the model']) {
    await tabTo(kbButton('Add a specification'), 'J3: Add a specification');
    await kb.keyboard.press('Enter');
    await tabTo(kbButton(pattern), `J3: the pattern "${pattern}"`);
    await kb.keyboard.press('Enter');
  }
  await kb.locator('.verdict.pass, .verdict.incomplete').filter({ hasText: 'Valid' }).waitFor({ timeout: 30000 }).catch(async (e) => { console.log(`J3 stopped: ${(await kb.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 1500)}`); throw e; });
  const j3 = await saveByKey(kbButton('Download .ids'), 'j3.ids', 'J3: Download .ids', true);
  check('J3 by keyboard alone: New, a title, two specifications from patterns, download a file the engine accepts', cannot.length === 0 && (j3.text.match(/<specification /g) ?? []).length === 2 && j3.text.includes('<title>Made by keyboard</title>') && engine(j3.path).valid === true, cannot.join(', '));
  await kctx.close();

  // ---- the end ---------------------------------------------------------------------------------
  await collect();
  check('at no moment of this script did the page show a result of another text, of another model, or a row with another specification\'s state', stale.length === 0 && seen > 100, `${stale.slice(0, 3).join(' ; ')} | changes of the page watched: ${seen}`);
  check('no request to anywhere but the local server', blocked.length === 0, blocked.slice(0, 3).join(' '));
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`assertions passed: ${passed}, failed: ${failed}, total: ${passed + failed}`);
process.exit(failed ? 1 : 0);
