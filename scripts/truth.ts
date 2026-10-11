// Runs the same validation function the app uses over the official buildingSMART
// IDS test cases and compares each verdict with the file-name prefix.
// Usage: npx vite-node scripts/truth.ts <TestCases dir>
import fs from 'node:fs';
import path from 'node:path';
import { readIds, runValidation } from '../src/core/validate';

const root = process.argv[2];
if (!root) throw new Error('usage: truth.ts <TestCases dir>');

const quiet = (fn: () => Promise<void>) => fn();
const origLog = console.log, origWarn = console.warn, origErr = console.error, origInfo = console.info;
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { console.log = origLog; console.warn = origWarn; console.error = origErr; console.info = origInfo; };

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

const rows: any[] = [];
await quiet(async () => {
  for (const idsPath of files) {
    const base = path.basename(idsPath, '.ids');
    const prefix = base.split('-')[0];
    if (!['pass', 'fail', 'invalid'].includes(prefix)) continue;
    const ifcPath = idsPath.replace(/\.ids$/, '.ifc');
    if (!fs.existsSync(ifcPath)) continue;
    const b = fs.readFileSync(ifcPath);
    mute();
    let verdict: string, detail = '';
    try {
      const r = await runValidation({
        ids: readIds(fs.readFileSync(idsPath, 'utf8')), idsName: base + '.ids',
        ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ifcName: base + '.ifc',
      });
      verdict = r.allPassed ? 'pass' : 'fail';
      detail = r.specs.map((s) => `${s.state}(${s.applicable}/${s.passed}/${s.failed})${s.note ? ' ' + s.note : ''}`).join('; ');
    } catch (e: any) {
      verdict = 'error:' + (e.kind ?? 'unexpected'); detail = e.message;
    }
    // Diagnostic only: when the app refuses on schema, re-run with the IDS text
    // rewritten to target the model's own schema, to see whether the library's
    // verdict would otherwise agree. Reported separately; it is not the app's verdict.
    let schemaless: string | undefined;
    if (verdict === 'error:schema-mismatch') {
      const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(b.toString('latin1').slice(0, 4000));
      try {
        const r = await runValidation({
          ids: readIds(fs.readFileSync(idsPath, 'utf8').replace(/ifcVersion="[^"]*"/g, `ifcVersion="${m?.[1] ?? 'IFC4'}"`)),
          idsName: base + '.ids',
          ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ifcName: base + '.ifc',
        });
        schemaless = r.allPassed ? 'pass' : 'fail';
      } catch (e: any) { schemaless = 'error:' + e.message; }
    }
    unmute();
    rows.push({ file: path.relative(root, idsPath), expected: prefix, verdict, detail, schemaless });
  }
});

const pf = rows.filter((r) => r.expected !== 'invalid');
const agree = pf.filter((r) => r.expected === r.verdict);
const dis = pf.filter((r) => r.expected !== r.verdict);
const inv = rows.filter((r) => r.expected === 'invalid');
console.log(`pass/fail pairs found: ${pf.length}`);
console.log(`agreeing: ${agree.length}`);
console.log(`disagreeing: ${dis.length}`);
for (const d of dis) console.log(`  DISAGREE ${d.file}: expected ${d.expected}, got ${d.verdict} | ${d.detail}`);
const sl = dis.filter((d) => d.schemaless !== undefined);
console.log(`of the disagreements, schema refusals: ${sl.length}; with the IDS schema attribute rewritten to the model's schema, verdict matches the prefix: ${sl.filter((d) => d.schemaless === d.expected).length}`);
for (const d of sl.filter((d) => d.schemaless !== d.expected)) console.log(`  STILL DISAGREES ${d.file}: expected ${d.expected}, got ${d.schemaless}`);
const invRejected = inv.filter((r) => r.verdict.startsWith('error:'));
console.log(`invalid-* pairs found: ${inv.length}, rejected with an error: ${invRejected.length}`);
for (const d of inv.filter((r) => !r.verdict.startsWith('error:'))) console.log(`  INVALID ACCEPTED ${d.file}: verdict ${d.verdict} | ${d.detail}`);
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../.scratch/truth-rows.json'), JSON.stringify(rows, null, 1));
