/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The GUIDs of the BCF file are made from what the topic is about, not drawn at random: two downloads of one result
// agree (but for the creation date), a later run of the same IDS file gives the same failing group the same topic GUID,
// and a coordinator who imports it again gets updates, not copies. Duplicated GlobalIds do not use up the cap.
import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BCF_SELECTION_CAP, bcfBlob, uuidV5 } from '../src/core/bcf';
import type { RunResult } from '../src/core/types';
import { readBcf } from './helpers/bcf';
import { idsText, ifcText, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const gid = (i: number) => String(i).padStart(22, '0');
const wall = (i: number, name: string, g = i) => `#${i}=IFCWALL('${gid(g)}',$,'${name}',$,$,$,$,$,$);\n`;
const SHA = 'a'.repeat(64);
const ids = idsText(
  specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo')),
  specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Wilma')), // the same name again, another index
  specXml('A window is there', 'IFCWINDOW'),
);
const made = async (model: string, sha: string | null = SHA, spec = ids) => {
  const r: RunResult = await runText(spec, ifcText(model), { spill: true });
  r.idsSha256 = sha;
  return r;
};
const unzipped = async (b: Blob) => Object.fromEntries(Object.entries(unzipSync(new Uint8Array(await b.arrayBuffer()))).map(([k, v]) => [k, strFromU8(v)]));

describe('the GUIDs of the BCF file', () => {
  const model = wall(1, 'Wilma') + wall(2, 'Wilma') + wall(3, 'Waldo');

  it('make two downloads of one result identical but for the creation date, and valid', async () => {
    const r = await made(model);
    const a = await unzipped(await bcfBlob(r, new Date('2026-10-26T10:00:00Z')));
    const b = await unzipped(await bcfBlob(r, new Date('2026-10-26T10:00:00Z')));
    expect(b).toEqual(a);
    const c = await unzipped(await bcfBlob(r, new Date('2027-01-02T03:04:05Z')));
    const dateless = (f: Record<string, string>) => JSON.stringify(f).replace(/<CreationDate>[^<]*<\/CreationDate>/g, '');
    expect(Object.keys(c)).toEqual(Object.keys(a));
    expect(dateless(c)).toBe(dateless(a));
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
    expect((await readBcf(await bcfBlob(r))).invalid).toEqual([]);
  });

  it('are the version 5 UUIDs of the name, for a fixed namespace', async () => {
    // The DNS-namespace vector, as Python's uuid.uuid5 gives it.
    expect(await uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    const r = await made(model);
    const topics = (await readBcf(await bcfBlob(r))).topics;
    for (const t of topics) expect(t.guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(topics.map((t) => t.guid)).size).toBe(topics.length);
  });

  const guidsOf = async (r: RunResult) => (await readBcf(await bcfBlob(r))).topics.map((t) => t.guid).sort();

  it('stay the same for the same failing group in a later run of another model, and differ between groups, same-named specifications and IDS files', async () => {
    // Specification 0 fails on walls 1 and 2, specification 1 (same name) on wall 3, specification 2 as a whole: three topics.
    const first = await guidsOf(await made(model));
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
    // Another delivery: wall 1 is fixed, a wall 9 and a different name appear elsewhere. The same three groups fail.
    const later = await guidsOf(await made(wall(2, 'Wilma') + wall(3, 'Waldo') + wall(9, 'Wilma') + wall(10, 'Wilma')));
    expect(later).toEqual(first);
    // Another IDS file (other bytes) is another set of topics.
    const other = await guidsOf(await made(model, 'b'.repeat(64)));
    expect(other.filter((g) => first.includes(g))).toEqual([]);
  });

  it('stay the same when the elements of a group come to have values of their own in the reason, or stop having them', async () => {
    const one = idsText(specXml('Walls have a description', 'IFCWALL', undefined, '<requirements><attribute><name><simpleValue>Description</simpleValue></name><value><simpleValue>ok</simpleValue></value></attribute></requirements>'));
    const d = (i: number, v: string) => `#${i}=IFCWALL('${gid(i)}',$,'x','${v}',$,$,$,$,$);\n`;
    const same = await guidsOf(await made(d(1, 'a') + d(2, 'a'), SHA, one));
    const differ = await guidsOf(await made(d(1, 'a') + d(2, 'b'), SHA, one));
    expect(same).toHaveLength(1);
    expect(differ).toEqual(same);
  });
});

describe('a GlobalId repeated within a group', () => {
  const one = idsText(specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo')));
  it('is attached once and does not use a place of the cap', async () => {
    // 600 GlobalIds each on two walls, then 500 more: 1,100 distinct ids on 1,700 walls. The cap holds 1,000 distinct ones.
    let model = '';
    for (let i = 1; i <= 600; i++) model += wall(i, 'Wilma') + wall(2000 + i, 'Wilma', i);
    for (let i = 601; i <= 1100; i++) model += wall(i, 'Wilma');
    const r = await runText(one, ifcText(model), { spill: true });
    const bcf = await readBcf(await bcfBlob(r));
    expect(bcf.invalid).toEqual([]);
    const t = bcf.topics[0];
    expect(BCF_SELECTION_CAP).toBe(1000);
    expect(t.selection).toHaveLength(1000);
    expect(new Set(t.selection).size).toBe(1000);
    expect(t.selection).toEqual([...Array.from({ length: 600 }, (_, i) => gid(i + 1)), ...Array.from({ length: 400 }, (_, i) => gid(i + 601))]);
    expect(t.description).toContain('600 of them have a GlobalId that another element of this group has too');
    expect(t.description).toContain('Elements attached: first 1,000 of 1,700.');
  });
  it('says "all" when nothing but repeats is left out', async () => {
    const r = await runText(one, ifcText(wall(1, 'Wilma') + wall(2, 'Wilma', 1) + wall(3, 'Wilma')));
    const t = (await readBcf(await bcfBlob(r))).topics[0];
    expect(t.selection).toEqual([gid(1), gid(3)]);
    expect(t.description).toContain('Elements attached: 2 of 3.');
    expect(t.description).toContain('1 of them has a GlobalId that another element of this group has too');
  });
});
