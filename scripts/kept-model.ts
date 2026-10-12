/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Over every pass-/fail- pair of the official test cases: the result of a run that reads the model and the result of
// the next run, which is served from the kept copy, must be the same result (except the time).
// Usage: npx vite-node scripts/kept-model.ts <TestCases dir>
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { prepareIds } from '../src/core/prepare';
import { ModelKeeper, runSession } from '../src/core/session';

const root = process.argv[2];
if (!root) throw new Error('usage: kept-model.ts <TestCases dir>');
const log = console.log;
console.warn = console.error = console.info = console.log = () => {};
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/^(pass|fail)-.*\.ids$/.test(f.name)) files.push(p); } };
walk(root);
files.sort();
let pairs = 0, same = 0, reused = 0, reads = 0;
const wrong: string[] = [];
for (const idsPath of files) {
  const ifcPath = idsPath.replace(/\.ids$/, '.ifc');
  if (!fs.existsSync(ifcPath)) continue;
  const b = fs.readFileSync(ifcPath);
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const keeper = new ModelKeeper();
  const ref = { token: 1, name: path.basename(ifcPath), size: b.byteLength, lastModified: 1 };
  const read = async () => { reads++; return bytes.slice(0); };
  const { doc } = await prepareIds(fs.readFileSync(idsPath, 'utf8'));
  const req = { ids: doc, idsName: path.basename(idsPath), model: ref, read };
  const cold = await runSession(keeper, req);
  const warm = await runSession(keeper, req);
  pairs++;
  if (warm.reused) reused++;
  if (isDeepStrictEqual({ ...cold.result, seconds: 0 }, { ...warm.result, seconds: 0 })) same++;
  else wrong.push(path.relative(root, idsPath));
}
log(`pairs: ${pairs}; second run served from the kept copy: ${reused}; model reads in all: ${reads}; results identical to the run that read the model: ${same}`);
for (const w of wrong.slice(0, 10)) log(`  differs: ${w}`);
process.exit(wrong.length || reused !== pairs || reads !== pairs ? 1 : 0);
