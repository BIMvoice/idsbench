import { describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { loadSchema } from '@idsbench/check/ifc';
import { EXAMPLE_IDS, EXAMPLE_IFC } from '../src/core/example';
import { checkDocument } from '../src/core/ids/check';
import { PATTERNS } from '../src/core/ids/patterns';
import { readIdsText } from '../src/core/ids/read';
import { describeSpecification } from '../src/core/ids/words';
import { writeIds } from '../src/core/ids/write';
import { classOptions, dataTypeFor, dataTypeOptions, exactOption, filterOptions, plainName, predefinedTypeOptions, propertyOptions, psetOptions } from '../src/core/picks';
import { prepareIds } from '../src/core/prepare';
import { runValidation } from '../src/core/validate';
import { nodeEnv } from './helpers/dom';
import { doc } from './helpers/ids';

describe('plainName', () => {
  it('reads a technical name as words', () => {
    expect(plainName('IfcWall')).toBe('Wall');
    expect(plainName('IfcWallStandardCase')).toBe('Wall standard case');
    expect(plainName('Pset_WallCommon')).toBe('Wall common');
    expect(plainName('FireRating')).toBe('Fire rating');
    expect(plainName('IsExternal')).toBe('Is external');
    expect(plainName('IfcBuildingElementProxy')).toBe('Building element proxy');
    expect(plainName('GlobalId')).toBe('Global id');
  });
});

describe('pick-lists from the engine\'s IFC tables', async () => {
  const s = await loadSchema('IFC4');
  const classes = classOptions(s);
  it('offers classes with a plain name beside the technical one, and writes capitals', () => {
    expect(classes).toContainEqual({ value: 'IFCWALL', label: 'Wall (IfcWall)' });
    expect(classes).toContainEqual({ value: 'IFCDOOR', label: 'Door (IfcDoor)' });
    expect(classes.every((o) => o.value === o.value.toUpperCase())).toBe(true);
    // No geometry, no relationships: only things that are in a model or describe them.
    expect(classes.find((o) => o.value === 'IFCCARTESIANPOINT')).toBeUndefined();
    expect(classes.find((o) => o.value === 'IFCRELAGGREGATES')).toBeUndefined();
  });
  it('type-ahead finds by plain or technical text, starts-with first', () => {
    expect(filterOptions(classes, 'wall')[0]).toEqual({ value: 'IFCWALL', label: 'Wall (IfcWall)' });
    expect(filterOptions(classes, 'ifcdoor')[0].value).toBe('IFCDOOR');
    expect(filterOptions(classes, 'curtain').map((o) => o.value)).toContain('IFCCURTAINWALL');
    expect(filterOptions(classes, 'zzzz')).toEqual([]);
    expect(filterOptions(classes, '', 5)).toHaveLength(5);
    expect(filterOptions(classes, 'wall').every((o) => /wall/i.test(o.label))).toBe(true);
  });
  it('a typed name that is exactly an option is that option', () => {
    expect(exactOption(classes, 'ifcwall')?.value).toBe('IFCWALL');
    expect(exactOption(classes, 'Wall')?.value).toBe('IFCWALL');
    expect(exactOption(classes, 'Wal')).toBeNull();
    expect(exactOption(classes, '')).toBeNull();
  });
  it('choosing a class narrows the property sets and the predefined types', () => {
    const all = psetOptions(s), walls = psetOptions(s, 'IFCWALL'), doors = psetOptions(s, 'IFCDOOR');
    expect(walls.map((o) => o.value)).toContain('Pset_WallCommon');
    expect(walls.map((o) => o.value)).not.toContain('Pset_DoorCommon');
    expect(doors.map((o) => o.value)).toContain('Pset_DoorCommon');
    expect(walls.length).toBeLessThan(all.length);
    expect(walls).toContainEqual({ value: 'Pset_WallCommon', label: 'Wall common (Pset_WallCommon)' });
    // An unknown class narrows nothing, so a custom class still gets the whole list.
    expect(psetOptions(s, 'IFCNOTACLASS').length).toBe(all.length);
    expect(predefinedTypeOptions(s, 'IFCWALL').map((o) => o.value)).toContain('SHEAR');
    expect(predefinedTypeOptions(s, 'IFCNOTACLASS')).toEqual([]);
  });
  it('choosing a property set narrows the properties, and a property brings its data type', () => {
    const props = propertyOptions(s, 'Pset_WallCommon');
    expect(props).toContainEqual({ value: 'FireRating', label: 'Fire rating (FireRating)' });
    expect(props.map((o) => o.value)).not.toContain('HandicapAccessible');
    expect(propertyOptions(s, 'My_Custom_Set')).toEqual([]);
    expect(dataTypeFor(s, 'Pset_WallCommon', 'FireRating')).toBe('IFCLABEL');
    expect(dataTypeFor(s, 'Pset_WallCommon', 'IsExternal')).toBe('IFCBOOLEAN');
    expect(dataTypeFor(s, 'Pset_WallCommon', 'Nope')).toBeNull();
    expect(dataTypeOptions(s).map((o) => o.value)).toContain('IFCLABEL');
  });
  it('what the pick-lists write is accepted by the Check engine', async () => {
    const pick = (list: { value: string; label: string }[], typed: string) => filterOptions(list, typed)[0].value;
    const cls = pick(classes, 'door');
    const set = pick(psetOptions(s, cls), 'door common');
    const prop = pick(propertyOptions(s, set), 'fire r');
    const d = doc({ ...PATTERNS[0].make(), name: 'Doors have a fire rating' });
    const sp = d.specifications[0];
    (sp.applicability[0] as { name: unknown }).name = { kind: 'simple', value: cls };
    Object.assign(sp.requirements[0], { propertySet: { kind: 'simple', value: set }, baseName: { kind: 'simple', value: prop }, dataType: dataTypeFor(s, set, prop) });
    expect([cls, set, prop, (sp.requirements[0] as { dataType: string }).dataType]).toEqual(['IFCDOOR', 'Pset_DoorCommon', 'FireRating', 'IFCLABEL']);
    expect((await checkIds(writeIds(d))).findings).toEqual([]);
  });
});

describe('starting from a pattern', () => {
  it('there are five', () => expect(PATTERNS).toHaveLength(5));
  for (const p of PATTERNS) {
    it(`"${p.label}" is complete: the form has nothing to stop and the Check engine accepts it`, async () => {
      const d = doc(p.make());
      expect(checkDocument(d).filter((i) => i.level === 'error')).toEqual([]);
      const r = await checkIds(writeIds(d));
      expect(r.findings).toEqual([]);
      expect(r.valid).toBe(true);
      expect(describeSpecification(d.specifications[0]).mode).toBe('sentence');
    });
  }
  it('each call makes a new specification with its own identity', () => {
    expect(PATTERNS[0].make().uid).not.toBe(PATTERNS[0].make().uid);
  });
});

describe('the example that ships with the app', () => {
  it('is a valid IDS 1.0 file that opens in the forms', async () => {
    expect((await checkIds(EXAMPLE_IDS)).findings).toEqual([]);
    expect(readIdsText(EXAMPLE_IDS, nodeEnv).specifications).toHaveLength(3);
  });
  it('gives a mixed result on its model: Fail, Pass and Nothing to check', async () => {
    const bytes = new TextEncoder().encode(EXAMPLE_IFC);
    const r = await runValidation({ ids: (await prepareIds(EXAMPLE_IDS)).doc, idsName: 'e.ids', ifcBytes: bytes.buffer as ArrayBuffer, ifcName: 'e.ifc' });
    expect(r.specs.map((x) => x.state)).toEqual(['fail', 'pass', 'nothing']);
    expect(r.specs[0].failed).toBe(2);
    expect(r.verdict).toBe('fail');
  });
});
