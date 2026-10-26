/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Accessibility of the one page: axe-core (WCAG 2.0/2.1 A and AA, plus its best-practice rules) over the states that matter,
// in the light and the dark theme, and the keyboard journeys of a pick-list and of the dialogs. Serves dist/ on a free local
// port; headless Chromium; every request that is not to that server is blocked. axe-core is a development dependency only.
// Usage: node scripts/a11y-check.mjs <TestCases dir>      (run `npm run build` first)
//   <TestCases dir>  Documentation/ImplementersDocumentation/TestCases of buildingSMART/IDS
// Files it generates go to .scratch/a11y-check/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = process.argv[2];
if (!root) throw new Error('usage: a11y-check.mjs <TestCases dir>');
const cases = path.join(root, 'ids');
const dist = path.resolve('dist');
const out = path.resolve('.scratch/a11y-check');
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
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' | ' + String(extra).slice(0, 600) : ''}`); };

// ---- inputs -----------------------------------------------------------------
const NS = 'http://standards.buildingsmart.org/IDS';
const write = (name, content) => { const p = path.join(out, name); fs.writeFileSync(p, content); return p; };
const wall = (i, name = 'Waldo') => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'${name}',$,$,$,$,$,$);\n`;
const ifcText = (schema, body) =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
const entity = (cls) => `<entity><name><simpleValue>${cls}</simpleValue></name></entity>`;
const nameIs = (v) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements>`;
const spec = (name, applicability, req = '') => `<specification name="${name}" ifcVersion="IFC4">${applicability}${req}</specification>`;
const app = (min, max, cls) => `<applicability minOccurs="${min}" maxOccurs="${max}">${entity(cls)}</applicability>`;
const idsText = (specs) => `<?xml version="1.0" encoding="utf-8"?>\n<ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const goodIfc = write('two-walls.ifc', ifcText('IFC4', wall(1) + wall(2)));
const mixedIds = write('mixed.ids', idsText(
  spec('Required, met', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo')) +
  spec('Required, broken', app(1, 'unbounded', 'IFCWALL'), nameIs('Wilma')) +
  spec('Optional, nothing matches', app(0, 'unbounded', 'IFCDOOR'), nameIs('x')) +
  spec('Prohibited, found', app(0, 0, 'IFCWALL')),
));
const brokenIds = write('broken.ids', idsText(spec('Walls', app(1, 'unbounded', 'IFCWALL'), nameIs('Waldo')).replace('minOccurs="1"', 'minOccurs="2"')));
const notIfc = write('cut-off.ifc', ifcText('IFC4', wall(1)).replace('END-ISO-10303-21;\n', ''));
const invalidCase = fs.readdirSync(cases).filter((f) => /^invalid-.*\.ids$/.test(f)).sort()[0];
const invalidIds = path.join(cases, invalidCase);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  let stubWorker = false, stubXmllint = false;
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (stubWorker && /\/assets\/worker-/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.onmessage = () => {};' });
    if (stubXmllint && /\/assets\/xmllint-browser-/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.onmessage = () => {};' });
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const idsInput = page.locator('input[type=file]').nth(0);
  const ifcInput = page.locator('input[type=file]').nth(1);
  const fresh = async () => { await page.evaluate(() => sessionStorage.clear()).catch(() => {}); await page.goto(origin + '/'); };
  const settled = () => page.locator('.title-block[data-kind="run"] .headline, .error, .verdict.fail .verdict-word').first().waitFor({ timeout: 120000 });
  const checked = () => page.locator('.verdict.pass, .verdict.fail, .verdict.incomplete, .error').first().waitFor({ timeout: 60000 });

  /** axe over the whole page in both themes; serious and critical violations fail, the rest are listed. */
  const audit = async (label) => {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(150);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      for (const v of r.violations) console.log(`     ${label} [${scheme}] ${v.impact} ${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0].target.join(' ')} | ${(v.nodes[0].failureSummary ?? '').split('\n').slice(0, 2).join(' ').slice(0, 220)}`);
      check(`axe: ${label}, ${scheme} theme: 0 serious or critical violations`, bad.length === 0, bad.map((v) => v.id).join(','));
    }
    await page.emulateMedia({ colorScheme: 'light' });
  };

  // ---- states --------------------------------------------------------------
  await fresh();
  await page.locator('.drops').waitFor();
  await audit('empty page');

  await fresh();
  await idsInput.setInputFiles(mixedIds);
  await checked();
  await audit('valid IDS file, no model');

  await fresh();
  await idsInput.setInputFiles(brokenIds);
  await checked();
  await audit('IDS file that is not valid, findings shown');
  await fresh();
  await idsInput.setInputFiles(invalidIds);
  await checked();
  await audit('official invalid IDS file');

  await fresh();
  await idsInput.setInputFiles(mixedIds);
  await ifcInput.setInputFiles(goodIfc);
  await settled();
  await audit('model with a Fail result');
  await page.locator('details.fails > summary').first().click();
  await audit('model with a Fail result, failing elements open');
  await page.locator('.page-specs > .spec').first().locator('summary').click().catch(() => {});
  await audit('specification rows open');

  await page.getByRole('button', { name: /^Edit / }).nth(1).click();
  await page.getByRole('combobox').first().waitFor();
  await audit('Edit form open');
  const combo = page.getByRole('combobox').first();
  await combo.click();
  await combo.fill('door');
  await page.locator('[role=option]').first().waitFor({ timeout: 20000 });
  await audit('Edit form, pick-list open');

  await fresh();
  await idsInput.setInputFiles(mixedIds);
  await ifcInput.setInputFiles(notIfc);
  await page.locator('.model-refusal').first().waitFor({ timeout: 60000 });
  await audit('model refused');

  stubWorker = true;
  await fresh();
  await idsInput.setInputFiles(mixedIds);
  await ifcInput.setInputFiles(goodIfc);
  await page.locator('#stalled').waitFor({ timeout: 45000 });
  await audit('"Stop and try again"');
  stubWorker = false;

  stubXmllint = true;
  await fresh();
  await idsInput.setInputFiles(mixedIds);
  await page.locator('.title-block .model-refusal .error').waitFor({ timeout: 45000 });
  await audit('"Check again"');
  stubXmllint = false;

  // ---- keyboard: a pick-list, the Edit form, the menu that adds a specification ------------------
  const active = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}|${e.getAttribute('role') ?? ''}|${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 60)}` : ''; });
  const inRow = (n) => page.evaluate((n) => !!document.activeElement?.closest(`.page-specs > .spec:nth-child(${n})`), n);
  await fresh();
  await idsInput.setInputFiles(mixedIds);
  await ifcInput.setInputFiles(goodIfc);
  await settled();
  await page.locator('h1').click();
  const editName = 'Edit Required, broken';
  const editBtn = page.getByRole('button', { name: editName, exact: true });
  await editBtn.focus();
  await page.keyboard.press('Enter');
  check('keyboard: Enter on Edit opens the form and puts the keyboard in it', await page.evaluate(() => !!document.activeElement?.closest('.editing')) && (await page.locator('.spec.editing [role=combobox]').count()) > 0);
  let name = '';
  for (let i = 0; i < 12 && !/IFC class/.test(name); i++) { await page.keyboard.press('Tab'); name = await page.evaluate(() => document.activeElement.labels?.[0]?.textContent ?? ''); }
  check('keyboard: Tab reaches the IFC class pick-list', /IFC class/.test(name), name);
  // The IFC tables load on demand: open the list once so the class the field holds is the one the lists know.
  for (let i = 0; i < 40 && !(await page.locator('[role=option]:visible').count()); i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    if (!(await page.locator('[role=option]:visible').count())) await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  const original = await page.evaluate(() => document.activeElement.value);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('door');
  await page.locator('[role=option]:visible').first().waitFor({ timeout: 20000 });
  const cb = () => page.evaluate(() => {
    const e = document.activeElement;
    const list = document.getElementById(e.getAttribute('aria-controls') ?? '');
    const act = document.getElementById(e.getAttribute('aria-activedescendant') ?? '');
    return {
      role: e.getAttribute('role'), expanded: e.getAttribute('aria-expanded'), auto: e.getAttribute('aria-autocomplete'), named: !!e.labels?.[0]?.textContent,
      listRole: list?.getAttribute('role'), listLabel: list?.getAttribute('aria-label'), listShown: !!list && !list.hidden,
      actRole: act?.getAttribute('role'), actInList: !!act && !!list?.contains(act), actSelected: act?.getAttribute('aria-selected'), act: act?.textContent ?? '',
      selectedCount: list ? list.querySelectorAll('[aria-selected=true]').length : 0, text: e.value,
    };
  });
  const c1 = await cb();
  check('pick-list follows the ARIA combobox pattern: role, label, aria-expanded, aria-controls to a listbox, aria-autocomplete', c1.role === 'combobox' && c1.named && c1.expanded === 'true' && c1.auto === 'list' && c1.listRole === 'listbox' && c1.listShown && !!c1.listLabel, JSON.stringify(c1));
  check('pick-list: aria-activedescendant names an option of the list, selected, and only one is', c1.actRole === 'option' && c1.actInList && c1.actSelected === 'true' && c1.selectedCount === 1, JSON.stringify(c1));
  await page.keyboard.press('ArrowDown');
  const c2 = await cb();
  check('pick-list: ArrowDown moves the active option', c2.actInList && c2.act !== c1.act && c2.selectedCount === 1, `${c1.act} -> ${c2.act}`);
  await page.keyboard.press('Escape');
  const c3 = await cb();
  check('pick-list: Escape closes the list, keeps the keyboard in the field and puts the old text back', c3.expanded === 'false' && !c3.listShown && c3.role === 'combobox' && c3.text === original && (await page.locator('.spec.editing').count()) === 1, JSON.stringify(c3));
  await page.keyboard.press('ArrowDown');
  const c4 = await cb();
  check('pick-list: ArrowDown opens it again', c4.expanded === 'true' && c4.actInList, JSON.stringify(c4));
  await page.keyboard.press('Enter');
  const c5 = await cb();
  check('pick-list: Enter takes the active option and closes the list', c5.expanded === 'false' && c5.text !== '' && c5.role === 'combobox', JSON.stringify(c5));
  await page.waitForTimeout(300);

  // Done, from the keyboard, ends the editing; the keyboard must stay on the row it was in.
  const rowNo = await page.evaluate(() => [...document.querySelectorAll('.page-specs > .spec')].findIndex((e) => e.classList.contains('editing')) + 1);
  const foot = page.locator('.spec.editing .spec-foot').getByRole('button', { name: 'Done', exact: true });
  await foot.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const afterDone = await active();
  check('keyboard: Done at the foot of the form returns the keyboard to the row (its Edit button), not to the top of the page', (await inRow(rowNo)) && /^button\|\|Edit /.test(afterDone), afterDone);

  // The menu that adds a specification.
  await page.getByRole('button', { name: 'Add a specification', exact: true }).focus();
  await page.keyboard.press('Enter');
  const menuFocus = await page.evaluate(() => !!document.activeElement?.closest('.add-menu'));
  check('keyboard: Add a specification opens a menu and the keyboard goes into it', menuFocus);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const afterEsc = await active();
  check('keyboard: Escape closes the menu and the keyboard returns to Add a specification', (await page.locator('.add-menu').count()) === 0 && /Add a specification/.test(afterEsc), afterEsc);
  await page.getByRole('button', { name: 'Add a specification', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const afterCancel = await active();
  check('keyboard: Cancel closes the menu and the keyboard returns to Add a specification', (await page.locator('.add-menu').count()) === 0 && /Add a specification/.test(afterCancel), afterCancel);

  // Status changes are announced: the verdict and the result sit inside a polite live region that exists before they arrive.
  await fresh();
  const regionBefore = await page.locator('[aria-live=polite]').count();
  await idsInput.setInputFiles(mixedIds);
  await checked();
  check('live region: the verdict (Checking, then Valid) is written inside a polite live region', regionBefore >= 1 && (await page.locator('[aria-live=polite] .verdict-word').count()) === 1);
  await ifcInput.setInputFiles(goodIfc);
  await settled();
  check('live region: the run result is written inside a polite live region', (await page.locator('[aria-live=polite] .headline').count()) === 1);

  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
  server.close();
}
