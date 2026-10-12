/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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

  // The standard, in every version: "Reference ID for this specified type in this project (e.g. type 'A-1')". It is the
  // reference of the type, not a number of the item; and "the Name attribute refers to the short name or number of a
  // spatial element" (IfcSpatialElement.LongName, note). A person looking for the room number is sent to Name.
  it('typing "number" for a space does not send to Reference: Reference is found by "type mark" and says it is the type\'s; the room number is the attribute Name', async () => {
    const [x23, x4, x43] = await schemas;
    for (const lists of [listsFor([x4]), listsFor([x23, x4, x43])]) {
      const offered = lists.properties('Pset_SpaceCommon');
      expect(filterOptions(offered, 'number').map((o) => o.value)).not.toContain('Reference');
      expect(filterOptions(offered, 'room number').map((o) => o.value)).not.toContain('Reference');
      const found = filterOptions(offered, 'type mark');
      expect(found.map((o) => o.value)).toContain('Reference');
      expect(found.find((o) => o.value === 'Reference')?.meaning).toMatch(/^The reference of the type .* It is not a number of the item itself: a room number is the Name\.$/);
      const attributes = lists.attributes('IFCSPACE');
      expect(filterOptions(attributes, 'room number').map((o) => o.value)).toEqual(['Name']);
      expect(filterOptions(attributes, 'number').map((o) => o.value)).toContain('Name');
    }
  });

  it('says of a name only what holds wherever the standard has it: FireExit and Compartmentation are not about doors and walls alone, and "fire door" finds the fire rating, not the fire exit', async () => {
    const [, x4] = await schemas;
    const of = (n: string) => MEANINGS.find((m) => m.name === n)!;
    expect(of('FireExit').means).not.toMatch(/door/);
    expect(of('Compartmentation').means).toMatch(/wall or slab/);
    expect(of('SmokeStop').means).toMatch(/door or window/);
    const door = propertyOptions(x4, 'Pset_DoorCommon');
    expect(filterOptions(door, 'fire door').map((o) => o.value)).toEqual(['FireRating']);
    // Category is the use of a space in IFC2X3 only; the line says so instead of sending an IFC4 user to the category of an actor.
    expect(of('Category').means).toMatch(/In IFC2X3 this is the use of a space/);
    expect(x4.psets.filter((p) => p.props.some((q) => q.name === 'Category')).map((p) => p.name)).toEqual(['Pset_ActorCommon']);
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
