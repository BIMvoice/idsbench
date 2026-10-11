import { describe, expect, it } from 'vitest';
import { loadSchema, type IfcVersion } from '@idsbench/check/ifc';
import { MEANINGS } from '../src/core/meanings';
import { attributeOptions, filterOptions, listsFor, propertyOptions } from '../src/core/picks';

const VERSIONS: IfcVersion[] = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
const schemas = Promise.all(VERSIONS.map((v) => loadSchema(v)));

describe('the meanings table (an aid for searching, not the standard)', () => {
  it('has about forty entries and no name twice', () => {
    expect(MEANINGS.length).toBeGreaterThanOrEqual(35);
    expect(MEANINGS.length).toBeLessThanOrEqual(50);
    expect(new Set(MEANINGS.map((m) => m.name)).size).toBe(MEANINGS.length);
  });

  it('points every entry to a name that exists in the IFC tables (an attribute or a property of a standard set)', async () => {
    const all = await schemas;
    const names = new Set<string>();
    for (const s of all) {
      for (const a of s.allAttributeNames) names.add(a);
      for (const p of s.psets) for (const q of p.props) names.add(q.name);
    }
    expect(MEANINGS.filter((m) => !names.has(m.name)).map((m) => m.name)).toEqual([]);
  });

  it('gives every entry search words and one line of meaning', () => {
    for (const m of MEANINGS) {
      expect(m.words.length, m.name).toBeGreaterThan(0);
      expect(m.means, m.name).toMatch(/^[A-Z].*\.$/);
      expect(m.means.includes('\n'), m.name).toBe(false);
    }
  });

  it('typing "number" for a space offers Reference, with its meaning', async () => {
    const [x23, x4, x43] = await schemas;
    for (const lists of [listsFor([x4]), listsFor([x23, x4, x43])]) {
      const offered = lists.properties('Pset_SpaceCommon');
      const found = filterOptions(offered, 'number');
      expect(found.map((o) => o.value)).toContain('Reference');
      expect(found.find((o) => o.value === 'Reference')?.meaning).toMatch(/room number/);
    }
  });

  it('finds fire resistance, sound and U value by what they mean', async () => {
    const [, x4] = await schemas;
    const wall = propertyOptions(x4, 'Pset_WallCommon');
    expect(filterOptions(wall, 'fire resistance')[0].value).toBe('FireRating');
    expect(filterOptions(wall, 'sound').map((o) => o.value)).toContain('AcousticRating');
    expect(filterOptions(wall, 'u value').map((o) => o.value)).toContain('ThermalTransmittance');
    expect(filterOptions(wall, 'exterior').map((o) => o.value)).toContain('IsExternal');
    expect(filterOptions(wall, 'structural').map((o) => o.value)).toContain('LoadBearing');
  });

  it('finds the attribute LongName by "full name" for a space', async () => {
    const [, x4] = await schemas;
    expect(filterOptions(attributeOptions(x4, 'IFCSPACE'), 'full name').map((o) => o.value)).toContain('LongName');
  });

  it('does not touch a name typed in full: the name itself still ranks first', async () => {
    const [, x4] = await schemas;
    expect(filterOptions(propertyOptions(x4, 'Pset_SpaceCommon'), 'reference')[0].value).toBe('Reference');
  });
});
