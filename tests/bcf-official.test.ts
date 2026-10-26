/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The BCF file of every fail- pair of the official buildingSMART IDS test cases: valid against the BCF 2.1 schemas, one
// topic per failing group (and per specification that failed as a whole), and the components are the failing GlobalIds.
// The test cases are not part of this repository: set IDS_TESTCASES to their folder (Documentation/ImplementersDocumentation/TestCases of
// https://github.com/buildingSMART/IDS), or keep a clone of it at .scratch/IDS. Without them this test is skipped, and says so.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bcfBlob, BCF_SELECTION_CAP, isBcfGuid } from '../src/core/bcf';
import { groupFailures } from '../src/core/groups';
import { prepareIds } from '../src/core/prepare';
import { sentencesFor } from '../src/core/sentences';
import { runValidation } from '../src/core/validate';
import { nodeEnv } from './helpers/dom';
import { readBcf } from './helpers/bcf';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.IDS_TESTCASES ?? path.resolve(here, '../.scratch/IDS/Documentation/ImplementersDocumentation/TestCases');
const found = fs.existsSync(root);
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/^fail-.*\.ids$/.test(f.name) && fs.existsSync(p.replace(/\.ids$/, '.ifc'))) files.push(p); } };
if (found) walk(root);
files.sort();

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

describe.skipIf(!found)('the BCF file of the official fail- pairs', () => {
  it('finds the test cases', () => expect(files.length).toBeGreaterThan(100));
  it('is valid, has a topic per failing group, and names exactly the failing GlobalIds', { timeout: 600_000 }, async () => {
    const wrong: string[] = [];
    let withTopics = 0, topics = 0, wholeTopics = 0, unnamed = 0;
    for (const idsPath of files) {
      const where = path.relative(root, idsPath);
      const text = fs.readFileSync(idsPath, 'utf8');
      const b = fs.readFileSync(idsPath.replace(/\.ids$/, '.ifc'));
      const input = { ids: (await prepareIds(text)).doc, idsName: path.basename(idsPath), ifcBytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ifcName: path.basename(idsPath).replace(/\.ids$/, '.ifc'), sentences: await sentencesFor(text, nodeEnv) };
      // The file is made from the result as the worker makes it (spill); the expectation from the result that holds every element, grouped by the page's own code.
      const [held, made] = [await runValidation(input), await runValidation({ ...input, spill: true })];
      const expected = held.specs.flatMap((s) => [
        ...(s.wholeFailure ? [{ whole: true, ids: null as string[] | null }] : []),
        ...groupFailures(s.failures).map((g) => { const ids = g.elements.map((e) => e.globalId).filter(isBcfGuid).slice(0, BCF_SELECTION_CAP); return { whole: false, ids: ids.length ? ids : null }; }),
      ]);
      if (!expected.length) continue;
      const bcf = await readBcf(await bcfBlob(made));
      if (bcf.invalid.length) wrong.push(`${where}: not valid: ${bcf.invalid[0]}`);
      if (bcf.topics.length !== expected.length) { wrong.push(`${where}: ${expected.length} failing groups and ${bcf.topics.length} topics`); continue; }
      withTopics++;
      expected.forEach((e, i) => {
        const t = bcf.topics[i];
        topics++;
        if (e.whole) { wholeTopics++; if (t.selection !== null || t.viewpointFiles.length) wrong.push(`${where}: a whole-specification topic has components`); return; }
        if (e.ids === null) unnamed++;
        if (JSON.stringify(t.selection) !== JSON.stringify(e.ids)) wrong.push(`${where}: topic ${i} names other GlobalIds than the failing ones`);
        if (t.type !== 'Issue' || t.status !== 'Open' || !t.title || !t.labels[0]) wrong.push(`${where}: topic ${i} lacks type, status, title or label`);
      });
    }
    process.stdout.write(`BCF over ${files.length} fail- pairs: ${withTopics} with topics, ${topics} topics (${wholeTopics} for a specification that failed as a whole, ${unnamed} whose elements have no GlobalId to name)\n`);
    expect(wrong).toEqual([]);
    expect(withTopics).toBeGreaterThan(100);
  });
});
