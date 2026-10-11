// A fifth browser script: the proof gaps and the small things of the last round. A class is the exact class (the line
// on the specification and the action that adds the subtypes, run against a model that has both), a property set
// named Pset_ that the standard does not define is flagged and stops Download, and a Download pressed again and again
// gives a file or a sentence. Headless Chromium against dist/, every request that is not to the local server blocked.
// Usage: node scripts/proof-check.mjs      (CHROMIUM_PATH for an installed browser)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const out = path.resolve('.scratch/proof-check');
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
const G = (n) => String(n).padStart(22, '0');
const model = path.join(out, 'both-walls.ifc');
fs.writeFileSync(model, `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCWALL('${G(1)}',$,'plain',$,$,$,$,$,$);\n#2=IFCWALLSTANDARDCASE('${G(2)}',$,'standard case',$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const blocked = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin + '/') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', (d) => { void d.accept(); });
  await page.goto(origin + '/');
  const spec = (n) => page.locator('.page-specs > li.spec').nth(n);
  const dlBtn = page.getByRole('button', { name: 'Download .ids' });
  const addSpec = async (how) => {
    await page.getByRole('button', { name: 'Add a specification' }).click();
    await page.getByRole('group', { name: 'Start a specification from' }).getByRole('button', { name: how }).click();
  };

  // ---- a class is the exact class --------------------------------------------------------
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Title').fill('Exact classes');
  await addSpec('Elements must have a property');
  await page.locator('input[type=file]').nth(1).setInputFiles(model);
  const counts = () => spec(0).locator('.spec-counts').innerText();
  // New: "every wall" applies to the class and its subtypes, in the three versions, and the sentence says so.
  await spec(0).locator('.spec-words', { hasText: 'including' }).waitFor({ timeout: 20000 });
  check('a new "every wall" lists IfcWall and the subtype every version has, and the sentence says so', /^Every wall, including wall standard case, must have the property FireRating/.test(await spec(0).locator('.spec-words').innerText()) && (await spec(0).getByRole('checkbox', { name: /^Include the subtypes: wall standard case/ }).isChecked()), await spec(0).locator('.spec-words').innerText());
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  await page.locator('.title-block[data-kind="run"]').waitFor({ timeout: 20000 });
  check('and the run applies to the wall and the standard-case wall', (await counts()).startsWith('Applied to 2 elements'), await counts());
  // One clear control narrows it to the exact class; the rest of this section is about the exact class, for IFC4 only.
  await spec(0).getByRole('button', { name: /^Edit / }).click();
  await spec(0).getByRole('checkbox', { name: /^Include the subtypes/ }).click();
  await spec(0).locator('details.more').last().locator('summary').click();
  await spec(0).getByLabel('IFC2X3', { exact: true }).uncheck();
  await spec(0).getByLabel('IFC4X3_ADD2', { exact: true }).uncheck();
  const note = spec(0).locator('.subtype-note');
  await note.waitFor({ timeout: 20000 });
  check('a specification for IfcWall says in one calm line that it is IfcWall only', (await note.innerText()).startsWith('This applies to IfcWall only, not to IfcWallElementedCase or IfcWallStandardCase.'), await note.innerText());
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  await page.locator('.title-block[data-kind="run"]').waitFor({ timeout: 20000 });
  check('the run agrees: it applied to the 1 IfcWall and not to the IfcWallStandardCase', (await counts()).startsWith('Applied to 1 element'), await counts());
  await page.getByRole('button', { name: 'Also apply it to the 2 subtypes' }).click();
  await page.locator('.title-block[data-kind="run"] .record', { hasText: 'unsaved changes' }).waitFor({ timeout: 20000 });
  check('the action adds the subtypes as a list: the line is gone and the sentence names them', (await spec(0).locator('.subtype-note').count()) === 0 && /wall, including wall elemented case and wall standard case|wall, including wall standard case/.test(await spec(0).locator('.spec-words').innerText()), await spec(0).locator('.spec-words').innerText());
  check('and the run now applies to both walls', (await counts()).startsWith('Applied to 2 elements'), await counts());
  check('the page offers to undo it', (await page.locator('.undo').innerText()).includes('Undo'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await spec(0).locator('.subtype-note').waitFor();
  check('Undo puts the single class and its line back', (await spec(0).locator('.subtype-note').innerText()).startsWith('This applies to IfcWall only'));
  // The versions the specification ticks decide which subtypes there are.
  await spec(0).getByRole('button', { name: /^Edit / }).click();
  await spec(0).locator('details.more').last().locator('summary').click();
  await spec(0).getByLabel('IFC4', { exact: true }).uncheck();
  await spec(0).getByLabel('IFC2X3', { exact: true }).check();
  check('with only IFC2X3 ticked the line names the one subtype that version has', (await spec(0).locator('.subtype-note').innerText()).startsWith('This applies to IfcWall only, not to IfcWallStandardCase.'), await spec(0).locator('.subtype-note').innerText());
  check('and its action names it', (await spec(0).getByRole('button', { name: 'Also apply it to IfcWallStandardCase' }).count()) === 1);
  // Both versions ticked: only what both have is offered; what one of them has is named and left out.
  await spec(0).getByLabel('IFC4', { exact: true }).check();
  await spec(0).locator('.subtype-note', { hasText: 'IFC4 only' }).waitFor({ timeout: 20000 });
  const bothText = await spec(0).locator('.subtype-note').innerText();
  check('with IFC2X3 and IFC4 ticked the action adds only the subtype both versions have, and the line says which one is left out and why', bothText.startsWith('This applies to IfcWall only, not to IfcWallElementedCase or IfcWallStandardCase. IfcWallElementedCase (IFC4 only) is not in every IFC version this specification ticks, so it is not offered.') && (await spec(0).getByRole('button', { name: 'Also apply it to IfcWallStandardCase' }).count()) === 1 && (await spec(0).getByRole('button', { name: /the 2 subtypes/ }).count()) === 0, bothText);
  await spec(0).getByLabel('IFC2X3', { exact: true }).uncheck();
  await page.getByRole('button', { name: /^Done editing/ }).first().click();

  // ---- an abstract class ------------------------------------------------------------------------
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Title').fill('Abstract class');
  await addSpec('Elements must have a name');
  await page.locator('input[type=file]').nth(1).setInputFiles(model);
  // An abstract class: nothing in a model is one, so the specification applies to nothing until its subtypes stand in its place.
  // (IfcBuildingElement is not a class of IFC4X3, so this specification is for IFC4 only.)
  await spec(0).locator('details.more').last().locator('summary').click();
  await spec(0).getByLabel('IFC2X3', { exact: true }).uncheck();
  await spec(0).getByLabel('IFC4X3_ADD2', { exact: true }).uncheck();
  const classBox = spec(0).locator('.facet-list[aria-label="Applies to"] input[role=combobox]').first();
  await classBox.fill('IFCBUILDINGELEMENT');
  await classBox.press('Tab');
  // A new specification does not keep an abstract class: nothing in a model is one, so the concrete subtypes stand in its place at once.
  await page.getByRole('button', { name: /^Done editing/ }).first().click();
  await page.locator('.title-block[data-kind="run"]').waitFor({ timeout: 20000 });
  check('an abstract class chosen in a new specification is replaced by its concrete subtypes, and the run applies to the wall and the standard-case wall', (await spec(0).locator('.subtype-note', { hasText: 'abstract class' }).count()) === 0 && (await counts()).startsWith('Applied to 2 elements') && (await dlBtn.isEnabled()), await counts());

  // ---- a property set named Pset_ that the standard does not define ---------------------------
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Title').fill('Own set');
  await addSpec('Elements must have a property');
  const prop = spec(0).locator('li.facet').nth(1);
  const setBox = prop.getByRole('combobox', { name: 'Property set', exact: true });
  await setBox.fill('Pset_MyOwnSet');
  await setBox.press('Enter');
  await page.locator('.verdict .verdict-word', { hasText: /Valid|Not valid/ }).first().waitFor({ timeout: 20000 });
  const msg = await prop.locator('.msg').allInnerTexts();
  check('a Pset_ name that the standard does not define is flagged beside the field', msg.some((m) => /Pset_|standard/i.test(m)), msg.join(' | '));
  check('and Download is off, with the reason', (await dlBtn.isDisabled()) && /Download is off until/.test(await page.locator('#ids-reason').innerText()), await page.locator('#ids-reason').innerText());
  await setBox.fill('wall common');
  await prop.locator('[role=option]').first().waitFor();
  await setBox.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#ids-reason')?.textContent?.includes('Pset_MyOwnSet'), null, { timeout: 15000 });
  check('a standard name takes the flag away and Download is on', await dlBtn.isEnabled());

  // ---- Download pressed again and again ------------------------------------------------------------
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Try an example' }).click();
  await page.locator('.title-block[data-kind="run"]').waitFor({ timeout: 30000 });
  let files = 0;
  page.on('download', () => { files++; });
  const report = page.getByRole('button', { name: 'Download report', exact: true });
  for (let i = 0; i < 25; i++) await report.click();
  await new Promise((r) => setTimeout(r, 6000));
  const said = await page.locator('#download-note').innerText().catch(() => '');
  check('25 presses with no pause: each press that fitted in the queue of 12 gave its file (one at a time, a tenth of a second apart), and the others were answered with a sentence', files >= 12 && files < 25 && /files are already waiting to be saved\. Press it again in a moment\./.test(said), `${files} files; ${said}`);
  files = 0;
  for (let i = 0; i < 12; i++) { await report.click(); await new Promise((r) => setTimeout(r, 300)); }
  await new Promise((r) => setTimeout(r, 1500));
  const many = await page.locator('#download-note').innerText().catch(() => '');
  check('12 presses, a third of a second apart: a file for each', files === 12, `${files}`);
  check('and after 8 in a minute a sentence says what the browser may do and what to do', /files in the last minute.*allow downloads for this site/.test(many), many);

  // A press waits its turn; when the page changes before its turn comes, no file of what was there is given.
  await new Promise((r) => setTimeout(r, 9000));
  files = 0;
  await report.evaluate((b) => { for (let i = 0; i < 8; i++) b.click(); });
  await spec(0).getByRole('button', { name: /^Edit / }).click();
  await spec(0).getByLabel('Name', { exact: true }).fill('Changed while files were waiting');
  await page.waitForFunction(() => /was not saved: the page changed/.test(document.querySelector('#download-note')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const outdated = await page.locator('#download-note').innerText().catch(() => '');
  check('8 presses and then a change to the document: the presses whose turn came after the change gave no file of the document as it was, and a sentence says to press again', files >= 1 && files < 8 && /The report was not saved: the page changed while the file was waiting its turn\. Press it again for the file of what is on the page now\./.test(outdated), `${files} files; ${outdated}`);

  check('no request to anything but the local server', blocked.length === 0, blocked.join(', '));
  check('no error on the page', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(out, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
