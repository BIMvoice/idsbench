/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The BCF 2.1 file of a result: valid against the official schemas, one topic per group of failing elements, the
// components are the failing GlobalIds (capped), and a specification that failed as a whole has a topic without any.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BCF_SELECTION_CAP, bcfBlob, bcfTopicPlans, BcfGroupAccumulator } from '../src/core/bcf';
import { failuresCsvParts, parseCsv, bcfName } from '../src/core/csv';
import { groupFailures } from '../src/core/groups';
import { reportParts } from '../src/core/format';
import type { RunResult } from '../src/core/types';
import { readBcf } from './helpers/bcf';
import { sentencesFor } from '../src/core/sentences';
import { nodeEnv } from './helpers/dom';
import { idsText, ifcText, line, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const gid = (i: number) => String(i).padStart(22, '0');
const attr = (n: string, v: string) => `<attribute><name><simpleValue>${n}</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute>`;
const wall = (i: number, name: string, description = '$') => `#${i}=IFCWALL('${gid(i)}',$,'${name}',${description === '$' ? '$' : `'${description}'`},$,$,$,$,$);\n`;

// Walls 1, 3: wrong name only. Wall 2: wrong description only. Wall 4: both. Wall 5: fine.
const model = ifcText(wall(1, 'Wilma', 'ok') + wall(2, 'Waldo', 'bad') + wall(3, 'Wilma', 'ok') + wall(4, 'Wilma', 'bad') + wall(5, 'Waldo', 'ok') + line(6, 'IFCDOOR', 'D'));
const specs = [
  specXml('Walls say who they are', 'IFCWALL', undefined, `<requirements>${attr('Name', 'Waldo')}${attr('Description', 'ok')}</requirements>`),
  specXml('A window is there', 'IFCWINDOW'),                                              // required, nothing matches: fails as a whole
  specXml('At most two walls', 'IFCWALL', 'minOccurs="1" maxOccurs="2"', nameIs('Waldo')), // not checked: no topic
  specXml('Doors are there', 'IFCDOOR'),                                                   // passes: no topic
  specXml('No doors', 'IFCDOOR', 'minOccurs="0" maxOccurs="0"'),                          // prohibited and present
];
const ids = idsText(...specs);

/** The failing GlobalIds of a result, by specification, whatever way they are held. */
const failingBySpec = (r: RunResult) => r.specs.map((s) => s.failures.map((f) => f.globalId));

describe.each([['as the page holds it', false], ['as the worker makes it', true]])('the BCF file of a result %s', (_label, spill) => {
  let r: RunResult, bcf: Awaited<ReturnType<typeof readBcf>>;
  beforeAll(async () => {
    r = await runText(ids, model, { spill, sentences: await sentencesFor(ids, nodeEnv) });
    bcf = await readBcf(await bcfBlob(r, new Date('2026-10-26T10:00:00Z')));
  });

  it('is BCF 2.1 and every file in it is valid against the official schemas', () => {
    expect(bcf.version).toBe('2.1');
    expect(bcf.invalid).toEqual([]);
    expect(bcf.files).toContain('bcf.version');
  });

  it('has one topic per failing group and one per specification that failed as a whole, and none for a specification not checked or passed', () => {
    const groups = r.specs.map((s) => groupFailures(s.failures).length);
    const whole = r.specs.filter((s) => s.wholeFailure).length;
    expect(groups).toEqual([3, 0, 0, 0, 1]);
    expect(whole).toBe(1);
    expect(bcf.topics.length).toBe(groups.reduce((a, b) => a + b, 0) + whole);
    expect(bcf.topics.length).toBe(5);
    expect(bcf.topics.map((t) => t.labels[0]).sort()).toEqual(['A window is there', 'No doors', 'Walls say who they are', 'Walls say who they are', 'Walls say who they are']);
  });

  it('makes every topic an open Issue labelled with its specification, and words the requirement as the CSV does', async () => {
    for (const t of bcf.topics) { expect(t.type).toBe('Issue'); expect(t.status).toBe('Open'); expect(t.labels).toHaveLength(1); expect(t.description.length).toBeGreaterThan(0); }
    const csv = parseCsv(await new Blob(failuresCsvParts(r)).text()).slice(1);
    const requirement = csv.find((x) => x[1] === 'Walls say who they are')![2];
    expect(requirement.length).toBeGreaterThan(0);
    const walls = bcf.topics.filter((t) => t.labels[0] === 'Walls say who they are');
    for (const t of walls) expect(t.title.startsWith(requirement)).toBe(true);
    // Several groups in one specification: the reason tells the titles apart.
    expect(new Set(walls.map((t) => t.title)).size).toBe(3);
  });

  it('names the failing elements by GlobalId, group by group, and no others', () => {
    const walls = bcf.topics.filter((t) => t.labels[0] === 'Walls say who they are');
    const expected = groupFailures(r.specs[0].failures).map((g) => g.elements.map((e) => e.globalId));
    expect(walls.map((t) => t.selection)).toEqual(expected);
    expect(expected.flat().sort()).toEqual([gid(1), gid(2), gid(3), gid(4)]);
    const doors = bcf.topics.find((t) => t.labels[0] === 'No doors')!;
    expect(doors.selection).toEqual([gid(6)]);
    // Every GlobalId the run counted as failing is in exactly one topic.
    const all = bcf.topics.flatMap((t) => t.selection ?? []).sort();
    expect(all).toEqual(failingBySpec(r).flat().sort());
  });

  it('gives a viewpoint with a Selection and no camera, and gives a specification that failed as a whole a topic with no components at all', () => {
    for (const t of bcf.topics.filter((x) => x.selection)) expect(t.cameras).toBe(0);
    const whole = bcf.topics.find((t) => t.labels[0] === 'A window is there')!;
    expect(whole.selection).toBeNull();
    expect(whole.viewpointFiles).toEqual([]);
    expect(whole.description).toContain('needs at least one matching element');
  });

  it('says in each description how many elements are attached', () => {
    const walls = bcf.topics.filter((t) => t.labels[0] === 'Walls say who they are');
    expect(walls.map((t) => /Elements attached: all (\d+)\./.exec(t.description)?.[1])).toEqual(['2', '1', '1']);
  });
});

describe('the two ways of making the file agree', () => {
  it('give the same topics from a result held in full and from one made as the worker makes it', async () => {
    const sentences = await sentencesFor(ids, nodeEnv);
    const [held, spilled] = await Promise.all([runText(ids, model, { sentences }), runText(ids, model, { spill: true, sentences })]);
    expect(bcfTopicPlans(spilled)).toEqual(bcfTopicPlans(held));
  });
});

describe('the cap on one topic', () => {
  const N = 1200;
  const big = ifcText(Array.from({ length: N }, (_, i) => wall(i + 1, 'Wilma')).join(''));
  const one = idsText(specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo')));
  it('is 1,000 components, said in the description, while the CSV stays complete', async () => {
    expect(BCF_SELECTION_CAP).toBe(1000);
    for (const spill of [false, true]) {
      const r = await runText(one, big, { spill });
      const bcf = await readBcf(await bcfBlob(r));
      expect(bcf.invalid).toEqual([]);
      expect(bcf.topics).toHaveLength(1);
      const t = bcf.topics[0];
      expect(t.selection).toHaveLength(1000);
      expect(t.selection).toEqual(Array.from({ length: 1000 }, (_, i) => gid(i + 1)));
      expect(t.description).toContain('Elements attached: first 1,000 of 1,200.');
      expect(t.description).toContain('1,200 elements fail this requirement.');
      const csv = parseCsv(await new Blob(failuresCsvParts(r)).text()).slice(1);
      expect(csv).toHaveLength(N);
    }
  });
  it('is exactly the cap: a group of 1,000 says "all"', async () => {
    const r = await runText(one, ifcText(Array.from({ length: 1000 }, (_, i) => wall(i + 1, 'Wilma')).join('')));
    const t = (await readBcf(await bcfBlob(r))).topics[0];
    expect(t.selection).toHaveLength(1000);
    expect(t.description).toContain('Elements attached: all 1,000.');
  });
});

describe('elements that cannot be named', () => {
  it('leaves out a GlobalId that is not 22 characters of the IFC alphabet (it would make the whole file invalid) and says so', async () => {
    const m = ifcText(`#1=IFCWALL('${gid(1)}',$,'Wilma',$,$,$,$,$,$);\n#2=IFCWALL('short',$,'Wilma',$,$,$,$,$,$);\n#3=IFCWALL('${'a b'.padEnd(22, 'c')}',$,'Wilma',$,$,$,$,$,$);\n`);
    const r = await runText(idsText(specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo'))), m);
    const bcf = await readBcf(await bcfBlob(r));
    expect(bcf.invalid).toEqual([]);
    expect(bcf.topics[0].selection).toEqual([gid(1)]);
    expect(bcf.topics[0].description).toContain('Elements attached: 1 of 3.');
    expect(bcf.topics[0].description).toContain('2 of them have no valid GlobalId');
  });
  it('keeps characters that XML cannot hold out of the file', async () => {
    const acc = new BcfGroupAccumulator();
    acc.add({ ifcClass: 'IfcWall', name: 'a', globalId: gid(1), reasons: ['Name is "a\u0001b & <c>".'] });
    const r = await runText(idsText(specXml('Walls x', 'IFCWALL', undefined, nameIs('Waldo'))), ifcText(wall(1, 'Wilma')));
    r.specs[0].name = 'Walls "x" & <y>';
    r.specs[0].requirement = 'Name must be "a\u0001b" & <c>';
    const bcf = await readBcf(await bcfBlob(r));
    expect(bcf.invalid).toEqual([]);
    expect(bcf.topics[0].title).toBe('Name must be "ab" & <c>');
    expect(bcf.topics[0].labels[0]).toBe('Walls "x" & <y>');
  });
});

describe('what the file is not', () => {
  it('is not part of the JSON report and has its own name', async () => {
    const r = await runText(ids, model, { spill: true });
    r.bcf = await bcfBlob(r);
    const json = await new Blob(reportParts(r)).text();
    expect(JSON.parse(json).bcf).toBeUndefined();
    expect(bcfName('Tower.ifc')).toBe('Tower-failing-elements.bcfzip');
  });
  it('has no topic for a result that passed', async () => {
    const r = await runText(idsText(specXml('Doors are there', 'IFCDOOR')), model);
    expect(bcfTopicPlans(r)).toEqual([]);
  });
});
