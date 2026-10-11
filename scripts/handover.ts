// The hand-over, counted over every pass-/fail- pair of the official test cases: the CSV of failing elements holds one
// row per failing element the run counted, per specification; the groups by reason hold every element exactly once;
// and the report holds the same elements. Also says how many specifications fail as a whole, with no element to list.
// Usage: npx vite-node scripts/handover.ts <TestCases dir>
import fs from 'node:fs';
import path from 'node:path';
import { CSV_COLUMNS, ROW_KINDS, failureCount, failuresCsvParts, parseCsv, wholeFailureCount } from '../src/core/csv';
import { reportParts } from '../src/core/format';
import { groupFailures } from '../src/core/groups';
import { prepareIds } from '../src/core/prepare';
import { runValidation } from '../src/core/validate';

const root = process.argv[2];
if (!root) throw new Error('usage: handover.ts <TestCases dir>');
const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { Object.assign(console, original); };

const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/^(pass|fail)-.*\.ids$/.test(f.name)) files.push(p); } };
walk(root);
files.sort();

let pairs = 0, failPairs = 0, specs = 0, elements = 0, csvElementRows = 0, csvWholeRows = 0, wholeSpecs = 0, groups = 0, singletons = 0;
let failPairsWithoutRows = 0, noName = 0, noId = 0, noReason = 0;
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
  const rows = parseCsv(await new Blob(failuresCsvParts(r)).text());
  const where = path.relative(root, idsPath);
  if (rows[0].join(',') !== CSV_COLUMNS.join(',')) wrong.push(`${where}: header`);
  if (rows.some((x) => x.length !== CSV_COLUMNS.length)) wrong.push(`${where}: a row with another number of cells`);
  const body = rows.slice(1);
  const elementRows = body.filter((x) => x[0] === ROW_KINDS.element), wholeRows = body.filter((x) => x[0] === ROW_KINDS.specification);
  if (elementRows.length + wholeRows.length !== body.length) wrong.push(`${where}: a row that is neither an element row nor a whole-specification row`);
  // The element rows are the failing elements the run counted, specification by specification.
  for (const s of r.specs) {
    const mine = elementRows.filter((x) => x[1] === s.name).length;
    const same = r.specs.filter((o) => o.name === s.name).length;
    if (same === 1 && mine !== (s.failureTotal ?? s.failures.length)) wrong.push(`${where}: "${s.name}" has ${s.failureTotal} failing elements and ${mine} element rows`);
  }
  // A whole-specification row has no element in it, and there is one for each specification that failed as a whole.
  if (wholeRows.some((x) => x[3] || x[4] || x[5])) wrong.push(`${where}: a whole-specification row names an element`);
  if (wholeRows.length !== wholeFailureCount(r)) wrong.push(`${where}: ${wholeFailureCount(r)} specifications failed as a whole and ${wholeRows.length} such rows`);
  for (const s of r.specs) {
    specs++;
    // What the run counts as failed is what it lists; a prohibited specification lists the elements that must not be there.
    if (s.failures.length !== s.failed && !(s.kind === 'prohibited' && s.failures.length === s.applicable)) wrong.push(`${where}: "${s.name}" counts ${s.failed} failed and lists ${s.failures.length}`);
    if (s.wholeFailure) wholeSpecs++;
    const g = groupFailures(s.failures);
    groups += g.length; singletons += g.filter((x) => x.elements.length === 1).length;
    if (g.reduce((n, x) => n + x.elements.length, 0) !== s.failures.length) wrong.push(`${where}: "${s.name}" groups do not add up`);
    for (const f of s.failures) { if (!f.name) noName++; if (!f.globalId) noId++; if (f.reasons.length === 0) noReason++; }
  }
  elements += failureCount(r);
  csvElementRows += elementRows.length;
  csvWholeRows += wholeRows.length;
  if (r.verdict === 'fail' && failureCount(r) === 0 && wholeFailureCount(r) === 0) failPairsWithoutRows++;
  const inReport = (JSON.parse(await new Blob(reportParts(r)).text()) as { specs: { failures: unknown[] }[] }).specs.reduce((n, s) => n + s.failures.length, 0);
  if (inReport !== failureCount(r)) wrong.push(`${where}: the report holds ${inReport} failing elements, the run ${failureCount(r)}`);
}
console.log(`pairs run: ${pairs}; with the verdict fail: ${failPairs}; specifications: ${specs}`);
console.log(`failing elements the runs counted: ${elements}; element rows in the CSV files: ${csvElementRows}; groups by reason: ${groups} (of one element: ${singletons})`);
console.log(`failing elements with no name: ${noName}; with no GlobalId: ${noId}; with no reason given: ${noReason}`);
console.log(`specifications that fail as a whole: ${wholeSpecs}; whole-specification rows in the CSV files: ${csvWholeRows}; pairs with the verdict fail and nothing at all to list: ${failPairsWithoutRows}`);
console.log(`disagreements: ${wrong.length}`);
for (const w of wrong.slice(0, 20)) console.log(`  ${w}`);
process.exit(wrong.length ? 1 : 0);
