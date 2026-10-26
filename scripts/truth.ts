/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Runs the same validation function the app uses over the official buildingSMART
// IDS test cases and compares each verdict with the file-name prefix. The inputs
// are used exactly as they are in the repository; nothing is rewritten.
// Usage: npx vite-node scripts/truth.ts <TestCases dir> [rows.json]
import fs from 'node:fs';
import path from 'node:path';
import { runValidation } from '../src/core/validate';
import { prepareIds } from '../src/core/prepare';

const root = process.argv[2];
if (!root) throw new Error('usage: truth.ts <TestCases dir> [rows.json]');

const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { Object.assign(console, original); };

const files: string[] = [];
const walk = (d: string) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.ids')) files.push(p);
  }
};
walk(root);
files.sort();

interface Row { file: string; expected: string; verdict: string; detail: string; schemaNotes: number }
const rows: Row[] = [];
for (const idsPath of files) {
  const base = path.basename(idsPath, '.ids');
  const prefix = base.split('-')[0];
  if (!['pass', 'fail', 'invalid'].includes(prefix)) continue;
  const ifcPath = idsPath.replace(/\.ids$/, '.ifc');
  if (!fs.existsSync(ifcPath)) continue;
  const b = fs.readFileSync(ifcPath);
  mute();
  let verdict: string, detail = '', schemaNotes = 0;
  try {
    const r = await runValidation({
      ids: (await prepareIds(fs.readFileSync(idsPath, 'utf8'))).doc, idsName: base + '.ids',
      ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ifcName: base + '.ifc',
    });
    verdict = r.verdict;
    detail = r.specs.map((s) => `${s.state}(${s.applicable}/${s.passed}/${s.failed})${s.note ? ' ' + s.note : ''}`).join('; ');
    schemaNotes = r.specs.filter((s) => s.schemaNote).length;
  } catch (e) {
    const err = e as { kind?: string; message?: string };
    verdict = 'error:' + (err.kind ?? 'unexpected'); detail = err.message ?? '';
  }
  unmute();
  rows.push({ file: path.relative(root, idsPath), expected: prefix, verdict, detail, schemaNotes });
}

// Run opens every IDS file through the Check engine first (prepareIds). A pair whose IDS the engine rejects gets
// no verdict ('error:ids-invalid'); it is counted and listed below, never run anyway.
const pf = rows.filter((r) => r.expected !== 'invalid');
const dis = pf.filter((r) => r.expected !== r.verdict);
const refusedPairs = pf.filter((r) => r.verdict.startsWith('error:'));
const inv = rows.filter((r) => r.expected === 'invalid');
console.log(`pass/fail pairs found: ${pf.length}`);
console.log(`agreeing: ${pf.length - dis.length}`);
console.log(`disagreeing: ${dis.length}`);
for (const d of dis) console.log(`  DISAGREE ${d.file}: expected ${d.expected}, got ${d.verdict} | ${d.detail}`);
console.log(`pass/fail pairs whose IDS file the Check engine rejects (no verdict): ${refusedPairs.length}`);
for (const r of refusedPairs) console.log(`  REJECTED ${r.file}: ${r.verdict} | ${r.detail}`);
console.log(`pairs where the model's IFC version is not one the specification lists (checked anyway, with a note): ${pf.filter((r) => r.schemaNotes > 0).length}`);
const count = (v: string) => inv.filter((r) => r.verdict === v).length;
console.log(`invalid-* pairs found: ${inv.length}; refused with a message: ${inv.filter((r) => r.verdict.startsWith('error:')).length}, verdict fail: ${count('fail')}, verdict pass: ${count('pass')}, verdict incomplete: ${count('incomplete')}`);
for (const d of inv.filter((r) => r.verdict === 'pass')) console.log(`  INVALID IDS GIVEN A PASS ${d.file} | ${d.detail}`);
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 1));
process.exit(dis.length ? 1 : 0);
