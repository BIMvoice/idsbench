/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';
import { alignResults, chooseDropped } from '../src/core/align';
import type { SpecRow } from '../src/core/types';

const row = (name: string): SpecRow => ({ name, state: 'pass', kind: 'required', applicable: 1, passed: 1, failed: 0, summary: '', note: null, schemaNote: null, failures: [] });

describe('a result row is shown beside the specification it was made for, or not at all', () => {
  const specs = [{ name: 'Walls' }, { name: 'Doors' }, { name: '' }];
  it('gives each specification its own row when the result lists the same specifications in the same order', () => {
    const result = { specs: [row('Walls'), row('Doors'), row('(unnamed specification)')] };
    expect(alignResults(specs, result)).toBe(result.specs);
    expect(alignResults([{ name: ' Walls\n are  named ' }], { specs: [row('Walls are named')] })).not.toBeNull();
  });
  it('gives nothing when the result has another number of specifications: no row then gets a neighbour\'s result', () => {
    expect(alignResults(specs, { specs: [row('Walls'), row('(unnamed specification)')] })).toBeNull();
    expect(alignResults(specs.slice(0, 2), { specs: [row('Walls'), row('Doors'), row('x')] })).toBeNull();
  });
  it('gives nothing when the order differs', () => {
    expect(alignResults(specs, { specs: [row('Doors'), row('Walls'), row('(unnamed specification)')] })).toBeNull();
  });
});

describe('several things dropped at once', () => {
  const f = (name: string) => ({ name });
  it('one IDS file and one model, in either order, are both taken and nothing is said', () => {
    for (const items of [[{ file: f('a.ids'), kind: 'ids' as const }, { file: f('m.ifc'), kind: 'ifc' as const }], [{ file: f('m.ifc'), kind: 'ifc' as const }, { file: f('a.ids'), kind: 'ids' as const }]]) {
      expect(chooseDropped(items)).toEqual({ ids: f('a.ids'), ifc: f('m.ifc'), left: null });
    }
  });
  it('of two IDS files the first is opened and the other is named as not opened', () => {
    const r = chooseDropped([{ file: f('a.ids'), kind: 'ids' }, { file: f('b.ids'), kind: 'ids' }]);
    expect(r.ids).toEqual(f('a.ids'));
    expect(r.left).toBe('2 IDS files arrived together. a.ids was opened; b.ids was not. The page holds one IDS file at a time.');
  });
  it('a third file is not dropped silently', () => {
    const r = chooseDropped([{ file: f('a.ids'), kind: 'ids' }, { file: f('m.ifc'), kind: 'ifc' }, { file: f('n.ifc'), kind: 'ifc' }, { file: f('o.ifc'), kind: 'ifc' }]);
    expect(r.ifc).toEqual(f('m.ifc'));
    expect(r.left).toBe('3 models arrived together. m.ifc was taken; n.ifc, o.ifc were not. The page checks one model at a time.');
  });
  it('a folder is named as a folder and nothing is opened from it', () => {
    expect(chooseDropped([{ file: f('Delivery'), kind: 'folder' }])).toEqual({ ids: null, ifc: null, left: 'Delivery is a folder: drop the IDS file and the model themselves, not the folder they are in.' });
  });
});
