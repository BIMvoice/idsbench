// The hand-over, counted over every pass-/fail- pair of the official test cases: the CSV of failing elements holds one
// row per failing element the run counted, per specification; the groups by reason hold every element exactly once;
// and the report holds the same elements. Also says how many specifications fail as a whole, with no element to list.
// Usage: npx vite-node scripts/handover.ts <TestCases dir>
import fs from 'node:fs';
import path from 'node:path';
import { CSV_COLUMNS, failureCount, failuresCsvParts } from '../src/core/csv';
import { reportParts } from '../src/core/format';
import { groupFailures } from '../src/core/groups';
import { prepareIds } from '../src/core/prepare';
import { runValidation } from '../src/core/validate';

const root = process.argv[2];
if (!root) throw new Error('usage: handover.ts <TestCases dir>');
const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { Object.assign(console, original); };

/** A CSV text as rows of cells (quoted cells may hold commas, quotes and line breaks). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const b = text.replace(/^﻿/, '');
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (quoted) { if (c === '"' && b[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && b[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  return rows;
}

const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/^(pass|fail)-.*\.ids$/.test(f.name)) files.push(p); } };
walk(root);
files.sort();

let pairs = 0, failPairs = 0, specs = 0, elements = 0, csvTotal = 0, groups = 0, singletons = 0;
let wholeSpecFailures = 0, failPairsWithoutRows = 0, noName = 0, noId = 0, noReason = 0;
const wrong: string[] = [];
for (const idsPath of files) {
  const ifcPath = idsPath.replace(/\.ids$/, '.ifc');
  if (!fs.existsSync(ifcPath)) continue;
  const b = fs.readFileSync(ifcPath);
  mute();
  let r;
  try {
    r = await runValidation({ ids: (await prepareIds(fs.readFileSync(idsPath, 'utf8'))).doc, idsName: path.basename(idsPath), ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ifcName: path.basename(ifcPath) });
  } catch (e) { unmute(); wrong.push(`${idsPath}: did not run (${(e as Error).message})`); continue; }
  unmute();
  pairs++;
  if (r.verdict === 'fail') failPairs++;
  const parts = failuresCsvParts(r);
  const rows = csvRows(parts.join(''));
  const where = path.relative(root, idsPath);
  if (rows[0].join(',') !== CSV_COLUMNS.join(',')) wrong.push(`${where}: header`);
  if (rows.some((x) => x.length !== CSV_COLUMNS.length)) wrong.push(`${where}: a row with another number of cells`);
  // One part per specification with failures, in order: its rows are that specification's failing elements.
  const failing = r.specs.filter((s) => s.failures.length > 0);
  if (parts.length - 1 !== failing.length) wrong.push(`${where}: ${parts.length - 1} parts for ${failing.length} specifications with failures`);
  failing.forEach((s, i) => { const n = csvRows(parts[i + 1]).length; if (n !== s.failures.length) wrong.push(`${where}: "${s.name}" has ${s.failures.length} failing elements and ${n} rows`); });
  for (const s of r.specs) {
    specs++;
    // What the run counts as failed is what it lists; a prohibited specification lists the elements that must not be there.
    if (s.failures.length !== s.failed && !(s.kind === 'prohibited' && s.failures.length === s.applicable)) wrong.push(`${where}: "${s.name}" counts ${s.failed} failed and lists ${s.failures.length}`);
    if (s.state === 'fail' && s.failures.length === 0) wholeSpecFailures++;
    const g = groupFailures(s.failures);
    groups += g.length; singletons += g.filter((x) => x.elements.length === 1).length;
    if (g.reduce((n, x) => n + x.elements.length, 0) !== s.failures.length) wrong.push(`${where}: "${s.name}" groups do not add up`);
    for (const f of s.failures) { if (!f.name) noName++; if (!f.globalId) noId++; if (f.reasons.length === 0) noReason++; }
  }
  elements += failureCount(r);
  csvTotal += rows.length - 1;
  if (r.verdict === 'fail' && failureCount(r) === 0) failPairsWithoutRows++;
  const inReport = (JSON.parse(reportParts(r).join('')) as { specs: { failures: unknown[] }[] }).specs.reduce((n, s) => n + s.failures.length, 0);
  if (inReport !== failureCount(r)) wrong.push(`${where}: the report holds ${inReport} failing elements, the run ${failureCount(r)}`);
}
console.log(`pairs run: ${pairs}; with the verdict fail: ${failPairs}; specifications: ${specs}`);
console.log(`failing elements the runs counted: ${elements}; rows in the CSV files: ${csvTotal}; groups by reason: ${groups} (of one element: ${singletons})`);
console.log(`failing elements with no name: ${noName}; with no GlobalId: ${noId}; with no reason given: ${noReason}`);
console.log(`specifications that fail as a whole, with no element to list: ${wholeSpecFailures}; pairs with the verdict fail and an empty list: ${failPairsWithoutRows}`);
console.log(`disagreements: ${wrong.length}`);
for (const w of wrong.slice(0, 20)) console.log(`  ${w}`);
process.exit(wrong.length ? 1 : 0);
