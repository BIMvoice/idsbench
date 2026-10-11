// Runs every pass-/fail- pair of the official test cases and writes the results (without the time) as one JSON file,
// so that two versions of the code can be compared result by result.
// Usage: npx vite-node scripts/snapshot-results.ts <TestCases dir> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { prepareIds } from '../src/core/prepare';
import { runValidation } from '../src/core/validate';

const [root, out] = process.argv.slice(2);
if (!root || !out) throw new Error('usage: snapshot-results.ts <TestCases dir> <out.json>');
console.log = console.warn = console.error = console.info = () => {};
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/^(pass|fail)-.*\.ids$/.test(f.name)) files.push(p); } };
walk(root);
files.sort();
const results: Record<string, unknown> = {};
for (const idsPath of files) {
  const ifcPath = idsPath.replace(/\.ids$/, '.ifc');
  if (!fs.existsSync(ifcPath)) continue;
  const b = fs.readFileSync(ifcPath);
  try {
    const { doc } = await prepareIds(fs.readFileSync(idsPath, 'utf8'));
    const r = await runValidation({ ids: doc, idsName: path.basename(idsPath), ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ifcName: path.basename(ifcPath), rangeIds: process.env.RANGE_IDS ? Number(process.env.RANGE_IDS) : undefined });
    results[path.relative(root, idsPath)] = { ...r, seconds: 0 };
  } catch (e) { results[path.relative(root, idsPath)] = { refused: (e as { kind?: string }).kind ?? String(e) }; }
}
fs.writeFileSync(out, JSON.stringify(results));
process.stdout.write(`${Object.keys(results).length} results written\n`);
