// "What to fix" is read by the person who models, who does what it says and sends the model back. The instruction has
// to be true: doing it makes the element pass. Each case here fails a model, builds the model the instruction describes,
// and runs it again. An instruction that leaves out the value asked for ("Add the property FireRating", when the
// requirement wants EI60) sends the model round a second time.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reasonOf, whatToFix } from '../src/core/reasons';
import { idsText, ifcText, line, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const G = (i: number) => String(i).padStart(22, '0');
const spec = (applies: string, requirements: string, version = 'IFC4') =>
  `<specification name="S" ifcVersion="${version}"><applicability minOccurs="0" maxOccurs="unbounded">${applies}</applicability><requirements>${requirements}</requirements></specification>`;
const cls = (c: string) => `<entity><name><simpleValue>${c}</simpleValue></name></entity>`;
const classes = (...c: string[]) => `<entity><name><xs:restriction base="xs:string">${c.map((x) => `<xs:enumeration value="${x}"/>`).join('')}</xs:restriction></name></entity>`;
const one = async (ids: string, model: string) => { const r = await runText(idsText(ids), ifcText(model)); return { state: r.specs[0].state, why: r.specs[0].failures[0]?.reasons[0], fix: r.specs[0].failures[0]?.toFix?.[0] }; };

describe('doing what "What to fix" says makes the element pass', () => {
  it('a property with a value asked for: the instruction says the value and the data type, and a property added with another value still fails', async () => {
    const ids = spec(cls('IFCWALL'), '<property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName><value><simpleValue>EI60</simpleValue></value></property>');
    const wall = line(1, 'IFCWALL', 'w');
    const withRating = (v: string) => `${wall}#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('${v}'),$);\n#3=IFCPROPERTYSET('${G(3)}',$,'Pset_WallCommon',$,(#2));\n#4=IFCRELDEFINESBYPROPERTIES('${G(4)}',$,$,$,(#1),#3);\n`;
    const before = await one(ids, wall);
    expect(before).toMatchObject({ state: 'fail', fix: 'Add the property FireRating to Pset_WallCommon set to "EI60" (data type IFCLABEL)' });
    // "Add the property FireRating to Pset_WallCommon" alone, done with a value of the modeller's own, does not pass.
    expect(await one(ids, withRating('30'))).toMatchObject({ state: 'fail', fix: 'Change Pset_WallCommon.FireRating to "EI60"' });
    expect((await one(ids, withRating('EI60'))).state).toBe('pass');
  });

  it('a classification with a code asked for: the instruction says the system and the code', async () => {
    const ids = spec(cls('IFCDOOR'), '<classification><value><simpleValue>EF_25_30</simpleValue></value><system><simpleValue>Uniclass 2015</simpleValue></system></classification>');
    const door = `#1=IFCDOOR('${G(1)}',$,'D',$,$,$,$,$,$,$,$,$,$);\n`;
    const classified = (system: string, code: string) => `${door}#2=IFCCLASSIFICATION('NBS',$,$,'${system}',$,$,$);\n#3=IFCCLASSIFICATIONREFERENCE($,'${code}','${code}',#2,$,$);\n#4=IFCRELASSOCIATESCLASSIFICATION('${G(4)}',$,$,$,(#1),#3);\n`;
    expect(await one(ids, door)).toMatchObject({ state: 'fail', fix: 'Classify this door in Uniclass 2015 with the code "EF_25_30"' });
    // Classified in the right system with another code: not yet what was asked.
    expect(await one(ids, classified('Uniclass 2015', 'Ss_25'))).toMatchObject({ state: 'fail', fix: 'Change the Uniclass 2015 classification code of this door to "EF_25_30"' });
    expect((await one(ids, classified('Uniclass 2015', 'EF_25_30'))).state).toBe('pass');
  });

  it('an attribute with a value asked for, left empty: the instruction says the value', async () => {
    const ids = spec(cls('IFCWALL'), '<attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>Foobar</simpleValue></value></attribute>');
    expect(await one(ids, line(1, 'IFCWALL', ''))).toMatchObject({ state: 'fail', why: 'Name is empty.', fix: 'Set the name of this wall to "Foobar"' });
    expect((await one(ids, line(1, 'IFCWALL', 'Foobar'))).state).toBe('pass');
  });

  it('an attribute the class does not have is not "empty", and the modeller is not told to fill it in', async () => {
    const ids = spec(classes('IFCSPACE', 'IFCWALL'), '<attribute><name><simpleValue>LongName</simpleValue></name></attribute>');
    const space = `#1=IFCSPACE('${G(1)}',$,'1.01',$,$,$,$,$,$,$,$);\n`;
    const r = await runText(idsText(ids), ifcText(space + line(2, 'IFCWALL', 'w')));
    const of = (c: string) => r.specs[0].failures.find((f) => f.ifcClass === c)!;
    expect(of('IfcSpace')).toMatchObject({ reasons: ['LongName is empty.'], toFix: ['Give this space a long name'] });
    expect(of('IfcWall')).toMatchObject({ reasons: ['An IfcWall has no attribute LongName in the IFC version of this model, so it cannot meet this requirement.'], toFix: ['Nothing can be filled in on this wall: change what the specification applies to, or what it asks for'] });
    // The space, with the long name filled in, passes; the wall cannot.
    const filled = await runText(idsText(ids), ifcText(`#1=IFCSPACE('${G(1)}',$,'1.01',$,$,$,$,'Meeting room',$,$,$);\n`));
    expect(filled.specs[0].state).toBe('pass');
  });

  it('a requirement that says "must not have": the reason has no unfilled placeholder and says what the element has', async () => {
    const ids = spec(cls('IFCWALL'), '<attribute cardinality="prohibited"><name><simpleValue>Description</simpleValue></name></attribute>');
    const described = `#1=IFCWALL('${G(1)}',$,'w','old text',$,$,$,$,$);\n`;
    const before = await one(ids, described);
    expect(before).toMatchObject({ state: 'fail', why: 'Prohibited: this element has the attribute Description.', fix: 'Remove the description from this wall' });
    expect(before.why).not.toMatch(/[{}]/);
    expect((await one(ids, line(1, 'IFCWALL', 'w'))).state).toBe('pass');
  });
});

describe('the instruction, for the kinds of failure the official cases produce', () => {
  const q = (type: string, failure: object, facet: object, optionality = 'required') => ({ status: 'fail', failure: { type, ...failure }, requirement: { optionality, facet } });
  const simple = (value: string) => ({ type: 'simpleValue', value });
  it('names a property once, also when the failure gives it with its set in front', () => {
    const facet = { type: 'property', propertySet: simple('Foo_Bar'), baseName: { type: 'pattern', pattern: 'Foo.*' }, value: { type: 'enumeration', values: ['x', 'y'] } };
    expect(whatToFix(q('PROPERTY_VALUE_MISMATCH', { field: 'Foo_Bar.Foobaz', expected: 'one of ["x", "y"]', actual: 'z' }, facet), 'IfcWall')).toBe('Change Foo_Bar.Foobaz to "x" or "y"');
  });
  it('says a range and a pattern in words', () => {
    expect(whatToFix(q('PROPERTY_OUT_OF_BOUNDS', { field: 'Foo_Bar.Foo', expected: '> 0' }, { type: 'property', propertySet: simple('Foo_Bar'), baseName: simple('Foo'), value: { type: 'bounds', minExclusive: 0, maxInclusive: 10 } }), 'IfcWall')).toBe('Change Foo_Bar.Foo to a value of more than 0 and at most 10');
    expect(whatToFix(q('ATTRIBUTE_PATTERN_MISMATCH', { field: 'Name', expected: 'pattern "AIR-.*"' }, { type: 'attribute', name: simple('Name'), value: { type: 'pattern', pattern: 'AIR-.*' } }), 'IfcAirTerminal')).toBe('Change the name to a value that matches the pattern "AIR-.*"');
    expect(whatToFix(q('CLASSIFICATION_MISSING', { expected: 'pattern "Foo.*"' }, { type: 'classification', system: { type: 'pattern', pattern: 'Foo.*' } }), 'IfcWall')).toBe('Classify this wall in a system whose name matches the pattern "Foo.*"');
  });
  it('says what an element has to be part of, by the relationship and the class, and has a sentence where the library gives only its code', () => {
    const facet = { type: 'partOf', relation: 'IfcRelAggregates', rawRelation: 'IFCRELAGGREGATES', entity: { type: 'entity', name: simple('IFCSLAB'), predefinedType: simple('FLOOR') } };
    expect(whatToFix(q('PARTOF_RELATION_MISSING', { expected: 'aggregated in "IFCSLAB"' }, facet), 'IfcBeam')).toBe('Make this beam a component of a slab of type "FLOOR"');
    const wrongType = q('PARTOF_PREDEFINED_TYPE_MISMATCH', { expected: '"FLOOR"', actual: 'BASESLAB', field: 'predefinedType' }, facet);
    expect(reasonOf(wrongType, 'IfcBeam')).toBe('This element is a component of an element of type "BASESLAB", and it has to be a component of a slab of type "FLOOR".');
    expect(whatToFix(wrongType, 'IfcBeam')).toBe('Make this beam a component of a slab of type "FLOOR"');
    const contained = { type: 'partOf', rawRelation: 'IFCRELCONTAINEDINSPATIALSTRUCTURE', entity: { type: 'entity', name: simple('IFCBUILDINGSTOREY') } };
    expect(whatToFix(q('PARTOF_RELATION_MISSING', {}, contained), 'IfcWall')).toBe('Place this wall in a building storey');
    expect(whatToFix({ status: 'fail', requirement: { optionality: 'prohibited', facet: contained } }, 'IfcWall')).toBe('Change this wall so that it is not located in a building storey');
    expect(reasonOf({ status: 'fail', requirement: { optionality: 'prohibited', facet: contained } })).toBe('Prohibited: this element is located in a building storey.');
  });
});
