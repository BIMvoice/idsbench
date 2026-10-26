/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { readIdsText } from '../src/core/ids/read';
import { nodeEnv } from './helpers/dom';
import type { ExampleEntry } from '../src/core/examples';

const dir = new URL('../public/examples/', import.meta.url);
const list = JSON.parse(fs.readFileSync(new URL('index.json', dir), 'utf8')).examples as ExampleEntry[];

describe('the bundled examples', () => {
  it('there are examples, each with a title and a description that gives its source and date', () => {
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const e of list) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.description).toMatch(/DiBK/);
      expect(e.description).toMatch(/2026-10-26/);
    }
  });
  it('every file in the folder is listed and every listed file exists', () => {
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.ids')).sort();
    expect(list.map((e) => e.file).sort()).toEqual(onDisk);
  });
  for (const e of list) {
    it(`${e.file}: valid, 0 findings, opens in the forms`, async () => {
      const text = fs.readFileSync(new URL(e.file, dir), 'utf8');
      const r = await checkIds(text);
      expect(r.valid).toBe(true);
      expect(r.findings).toEqual([]);
      expect(readIdsText(text, nodeEnv).specifications.length).toBeGreaterThan(0);
    });
  }
  it('the hard-requirements example has 7 specifications', () => {
    expect(readIdsText(fs.readFileSync(new URL('byggesaksbim.ids', dir), 'utf8'), nodeEnv).specifications).toHaveLength(7);
  });
});
