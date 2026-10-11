// IDS matches the exact class: "There is no automatic inheritance in IDS entity facet interpretation. In other words,
// all the entities need to be listed explicitly." (user manual, entity facet, "Inheritance"). The page says so beside the
// specification and offers the subtypes as a list.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema, type IfcVersion, type SchemaData } from '@idsbench/check/ifc';
import { readIdsText } from '../src/core/ids/read';
import { addSubtypes, subtypeAction, subtypeNote } from '../src/core/subtypes';
import { describeSpecification } from '../src/core/ids/words';
import { idsText, ifcText, line, runText, specXml } from './helpers/small-model';
import { nodeEnv } from './helpers/dom';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const schemas = async (...v: IfcVersion[]): Promise<SchemaData[]> => Promise.all(v.map((x) => loadSchema(x)));
const specOf = (cls: string, version = 'IFC4') => readIdsText(idsText(specXml('S', cls, undefined, '', version)), nodeEnv).specifications[0];

// A model with both a wall and a standard-case wall, and the same in each IFC version the standard covers.
const models = { IFC2X3: 'IFC2X3', IFC4: 'IFC4', IFC4X3: 'IFC4X3_ADD2' } as const;
const withBoth = (schema: string) => ifcText(line(1, 'IFCWALL', 'plain') + line(2, 'IFCWALLSTANDARDCASE', 'standard case'), schema);

describe('what the engine does with a class that has subtypes (the evidence for the note)', () => {
  for (const [label, schema] of Object.entries(models)) {
    it(`${label}: a specification for IFCWALL applies to the IfcWall and not to the IfcWallStandardCase`, async () => {
      const r = await runText(idsText(specXml('walls', 'IFCWALL', undefined, '', label === 'IFC4X3' ? 'IFC4X3_ADD2' : label)), withBoth(schema));
      expect(r.specs[0].applicable).toBe(1);
    });
    it(`${label}: naming both classes in a list applies to both`, async () => {
      const both = specXml('walls', 'IFCWALL', undefined, '').replace('<simpleValue>IFCWALL</simpleValue>', '<xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCWALLSTANDARDCASE"/></xs:restriction>');
      const r = await runText(idsText(both), withBoth(schema));
      expect(r.specs[0].applicable).toBe(2);
    });
  }
});

describe('the line on the specification', () => {
  it('says which classes it applies to and which subtypes it leaves out', async () => {
    expect(subtypeNote(specOf('IFCWALL'), await schemas('IFC4'))?.text).toBe('This applies to IfcWall only, not to IfcWallElementedCase or IfcWallStandardCase.');
    expect(subtypeNote(specOf('IFCWALL', 'IFC2X3'), await schemas('IFC2X3'))?.text).toBe('This applies to IfcWall only, not to IfcWallStandardCase.');
  });
  it('counts the subtypes of every ticked version, and none of a version that is not ticked', async () => {
    expect(subtypeNote(specOf('IFCSLAB', 'IFC2X3'), await schemas('IFC2X3'))).toBeNull();
    expect(subtypeNote(specOf('IFCSLAB'), await schemas('IFC4'))?.text).toBe('This applies to IfcSlab only, not to IfcSlabElementedCase or IfcSlabStandardCase.');
    expect(subtypeNote(specOf('IFCSLAB', 'IFC2X3 IFC4'), await schemas('IFC2X3', 'IFC4'))?.subtypes.map((s) => s.name)).toEqual(['IfcSlabElementedCase', 'IfcSlabStandardCase']);
  });
  it('says nothing for a class without subtypes, an unknown class, or a pattern', async () => {
    expect(subtypeNote(specOf('IFCSPACE'), await schemas('IFC4'))).toBeNull();
    expect(subtypeNote(specOf('IFCNOTACLASS'), await schemas('IFC4'))).toBeNull();
    expect(subtypeNote(specOf('IFCWALL'), [])).toBeNull();
    const pattern = readIdsText(idsText(specXml('S', 'IFCWALL', undefined, '').replace('<simpleValue>IFCWALL</simpleValue>', '<xs:restriction base="xs:string"><xs:pattern value="IFCWALL.*"/></xs:restriction>')), nodeEnv).specifications[0];
    expect(subtypeNote(pattern, await schemas('IFC4'))).toBeNull();
  });
  it('names several classes and their subtypes, and leaves out those already named', async () => {
    const list = specXml('S', 'IFCWALL', undefined, '').replace('<simpleValue>IFCWALL</simpleValue>', '<xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCDOOR"/><xs:enumeration value="IFCDOORSTANDARDCASE"/></xs:restriction>');
    const spec = readIdsText(idsText(list), nodeEnv).specifications[0];
    expect(subtypeNote(spec, await schemas('IFC4'))?.text).toBe('This applies to IfcWall, IfcDoor and IfcDoorStandardCase only, not to IfcWallElementedCase or IfcWallStandardCase.');
  });
  it('shortens a long list of subtypes', async () => {
    const note = subtypeNote(specOf('IFCFLOWSEGMENT', 'IFC4X3_ADD2'), await schemas('IFC4X3_ADD2'));
    expect(note?.text).toBe('This applies to IfcFlowSegment only, not to IfcCableCarrierSegment, IfcCableSegment, IfcConveyorSegment, IfcDuctSegment or IfcPipeSegment.');
  });
});

describe('the action that adds the subtypes as a list', () => {
  it('names the subtype, or counts them', async () => {
    const one = subtypeNote(specOf('IFCWALL', 'IFC2X3'), await schemas('IFC2X3'))!;
    expect(subtypeAction(one)).toBe('Also apply it to IfcWallStandardCase');
    expect(subtypeAction(subtypeNote(specOf('IFCWALL'), await schemas('IFC4'))!)).toBe('Also apply it to the 2 subtypes');
  });
  it('turns the class into a list of it and its subtypes, which then applies to both in the engine, and the line goes', async () => {
    const [schema] = await schemas('IFC4');
    const spec = specOf('IFCWALL');
    const note = subtypeNote(spec, [schema])!;
    const changed = addSubtypes(spec, note);
    expect(subtypeNote(changed, [schema])).toBeNull();
    const entity = changed.applicability[0];
    expect(entity.kind === 'entity' && entity.name.kind === 'restriction' && entity.name.facets.map((f) => f.value)).toEqual(['IFCWALL', 'IFCWALLELEMENTEDCASE', 'IFCWALLSTANDARDCASE']);
    expect(describeSpecification(changed).text).toBe('The model must contain at least one wall or IFCWALLELEMENTEDCASE or IFCWALLSTANDARDCASE.');
  });
});
