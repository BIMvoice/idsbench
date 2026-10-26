/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Runs an IDS file against an IFC model, as the page's worker does, and writes the BCF file of the failures
// (<out>.bcfzip) with what the file should hold (<out>.expected.json: the title and the GlobalIds of each topic),
// for scripts/bcf-client-check.py to read it back with another implementation.
// Usage: npx vite-node scripts/make-bcf.ts <file.ids> <model.ifc> <out base name, without extension>
import fs from 'node:fs';
import path from 'node:path';
import { bcfBlob, bcfTopicPlans } from '../src/core/bcf';
import { prepareIds } from '../src/core/prepare';
import { sentencesFor } from '../src/core/sentences';
import { runValidation } from '../src/core/validate';
import { nodeEnv } from '../tests/helpers/dom';

const [idsPath, ifcPath, out] = process.argv.slice(2);
if (!idsPath || !ifcPath || !out) throw new Error('usage: make-bcf.ts <file.ids> <model.ifc> <out base name>');
const text = fs.readFileSync(idsPath, 'utf8');
const b = fs.readFileSync(ifcPath);
const { log, warn, error, info } = console;
console.log = console.warn = console.error = console.info = () => {};
const result = await runValidation({
  ids: (await prepareIds(text)).doc, idsName: path.basename(idsPath), ifcName: path.basename(ifcPath), spill: true,
  ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  sentences: await sentencesFor(text, nodeEnv),
});
Object.assign(console, { log, warn, error, info });
fs.writeFileSync(`${out}.bcfzip`, Buffer.from(await (await bcfBlob(result)).arrayBuffer()));
fs.writeFileSync(`${out}.expected.json`, JSON.stringify(bcfTopicPlans(result).map((t) => ({ title: t.title, guids: t.ids })), null, 1));
console.log(`${bcfTopicPlans(result).length} topics, ${result.specs.reduce((n, s) => n + (s.failureTotal ?? 0), 0)} failing elements -> ${out}.bcfzip`);
