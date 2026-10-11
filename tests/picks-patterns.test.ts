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
    // A property people look for by what it means also carries its plain meaning and search words (core/meanings.ts).
    expect(props).toContainEqual(expect.objectContaining({ value: 'FireRating', label: 'Fire rating (FireRating)', meaning: expect.stringMatching(/resists fire/) }));
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

describe('pick-lists hold for every IFC version the specification ticks, and for its class', async () => {
  const { listsFor, attributeOptions } = await import('../src/core/picks');
  const { newFacet, newSpecification, simple } = await import('../src/core/ids/model');
  const [s2, s4, s43] = await Promise.all([loadSchema('IFC2X3'), loadSchema('IFC4'), loadSchema('IFC4X3_ADD2')]);
  const values = (o: { value: string }[]) => o.map((x) => x.value);
  const entity = (cls: string) => ({ ...newFacet('entity', 'applicability'), name: simple(cls) });
  const rejected = async (versions: string[], specs: { cls: string; req?: object }[]) => {
    const d = doc(...specs.map((x) => ({ ...newSpecification(), minOccurs: '1', name: 's', ifcVersion: versions, applicability: [entity(x.cls)], requirements: x.req ? [x.req] : [] })) as never[]);
    const r = await checkIds(writeIds(d));
    return r.findings.filter((f) => f.severity === 'error').map((f) => `${f.code}: ${f.message}`);
  };

  it('with two versions ticked, a class only one of them has is not offered; the engine rejects it, and accepts every class that is offered', async () => {
    const both = listsFor([s2, s4]);
    expect(values(classOptions(s2))).toContain('IFCELECTRICALELEMENT');
    expect(values(both.classes)).not.toContain('IFCELECTRICALELEMENT');
    expect(values(both.classes)).toContain('IFCWALL');
    expect((await rejected(['IFC2X3', 'IFC4'], [{ cls: 'IFCELECTRICALELEMENT' }]))[0]).toMatch(/entity-unknown-class.*IFC4/);
    expect(await rejected(['IFC2X3', 'IFC4'], both.classes.map((c) => ({ cls: c.value })))).toEqual([]);
    const three = listsFor([s2, s4, s43]);
    expect(await rejected(['IFC2X3', 'IFC4', 'IFC4X3_ADD2'], three.classes.map((c) => ({ cls: c.value })))).toEqual([]);
    expect(three.classes.length).toBeLessThan(both.classes.length);
  });
  it('one version alone offers what it offered before', () => {
    const one = listsFor([s4]);
    expect(one.classes).toEqual(classOptions(s4));
    expect(one.propertySets('IFCWALL')).toEqual(psetOptions(s4, 'IFCWALL'));
    expect(one.dataTypeFor('Pset_WallCommon', 'FireRating')).toBe('IFCLABEL');
  });
  it('property sets and properties are those every ticked version gives the class', async () => {
    const both = listsFor([s2, s4]);
    const onlyIn4 = values(psetOptions(s4, 'IFCWALL')).filter((p) => !values(psetOptions(s2, 'IFCWALL')).includes(p));
    expect(onlyIn4.length).toBeGreaterThan(0);
    expect(values(both.propertySets('IFCWALL')).filter((p) => onlyIn4.includes(p))).toEqual([]);
    const prop = (set: string, name: string, dataType: string | null) => ({ ...newFacet('property', 'requirements'), propertySet: simple(set), baseName: simple(name), dataType });
    expect((await rejected(['IFC2X3', 'IFC4'], [{ cls: 'IFCWALL', req: prop(onlyIn4[0], propertyOptions(s4, onlyIn4[0])[0].value, null) }])).length).toBeGreaterThan(0);
    const offered = both.propertySets('IFCWALL').flatMap((set) => both.properties(set.value).map((p) => ({ cls: 'IFCWALL', req: prop(set.value, p.value, both.dataTypeFor(set.value, p.value)) })));
    expect(offered.length).toBeGreaterThan(10);
    expect(await rejected(['IFC2X3', 'IFC4'], offered)).toEqual([]);
  });
  it('attribute names in "Must have" are those the class has: every one offered is accepted, and one of another class is rejected', async () => {
    const forWall = attributeOptions(s4, 'IFCWALL');
    expect(values(forWall)).toEqual(expect.arrayContaining(['Name', 'Description', 'GlobalId', 'PredefinedType', 'Tag']));
    expect(values(forWall)).not.toContain('AcidityConcentration');
    expect(attributeOptions(s4).length).toBeGreaterThan(forWall.length);
    const attr = (name: string) => ({ ...newFacet('attribute', 'requirements'), name: simple(name) });
    expect(await rejected(['IFC4'], forWall.map((a) => ({ cls: 'IFCWALL', req: attr(a.value) })))).toEqual([]);
    expect((await rejected(['IFC4'], [{ cls: 'IFCWALL', req: attr('OverallHeight') }]))[0]).toMatch(/applicability-requirements-incompatible/);
  });
  it('a choice that stops being valid is reported by the engine: the class changed under a property set, a version unticked or ticked', async () => {
    const prop = { ...newFacet('property', 'requirements'), propertySet: simple('Pset_WallCommon'), baseName: simple('FireRating'), dataType: 'IFCLABEL' };
    expect(await rejected(['IFC4'], [{ cls: 'IFCWALL', req: prop }])).toEqual([]);
    expect((await rejected(['IFC4'], [{ cls: 'IFCDOOR', req: prop }]))[0]).toMatch(/applicability-requirements-incompatible/);
    expect(await rejected(['IFC4X3_ADD2'], [{ cls: 'IFCBRIDGE' }])).toEqual([]);
    expect((await rejected(['IFC4', 'IFC4X3_ADD2'], [{ cls: 'IFCBRIDGE' }]))[0]).toMatch(/entity-unknown-class.*IFC4/);
  });
});

// A name only some ticked IFC versions define: what the note beside it says has to be what the Check engine does.
describe('a name that only some of the ticked IFC versions define', () => {
  const file = (pset: string, prop: string, versions: string) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd"><info><title>t</title></info><specifications><specification name="s" ifcVersion="${versions}"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property><propertySet><simpleValue>${pset}</simpleValue></propertySet><baseName><simpleValue>${prop}</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
  const errors = async (xml: string) => (await (await import('@idsbench/check')).checkIds(xml)).findings.filter((f) => f.severity === 'error').length;
  it('a property of a Pset_ set that IFC2X3 does not give it is refused while IFC2X3 is ticked, and the note says so; limited to the versions that define it, the file is valid', async () => {
    const { onlySomeNote } = await import('../src/core/picks');
    expect(await errors(file('Pset_WallCommon', 'Status', 'IFC2X3 IFC4 IFC4X3_ADD2'))).toBeGreaterThan(0);
    expect(await errors(file('Pset_WallCommon', 'Status', 'IFC4 IFC4X3_ADD2'))).toBe(0);
    expect(onlySomeNote('Status', 'Pset_WallCommon', ['IFC4', 'IFC4X3_ADD2'])).toBe('Status is defined by IFC4 and IFC4X3_ADD2 only, and this specification also lists the other IFC versions, so the check would refuse it.');
  });
  it('a Qto_ set that IFC2X3 does not define is accepted with IFC2X3 ticked, so the note does not say the check would refuse it', async () => {
    const { onlySomeNote } = await import('../src/core/picks');
    expect(await errors(file('Qto_WallBaseQuantities', 'NetVolume', 'IFC2X3 IFC4 IFC4X3_ADD2'))).toBe(0);
    const note = onlySomeNote('Qto_WallBaseQuantities', 'Qto_WallBaseQuantities', ['IFC4', 'IFC4X3_ADD2']);
    expect(note).not.toMatch(/refuse/);
    expect(note).toMatch(/^Qto_WallBaseQuantities is defined by IFC4 and IFC4X3_ADD2 only\./);
  });
});
