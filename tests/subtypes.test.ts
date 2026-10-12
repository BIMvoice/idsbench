/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// IDS matches the exact class: "There is no automatic inheritance in IDS entity facet interpretation. In other words,
// all the entities need to be listed explicitly." (user manual, entity facet, "Inheritance"). The page says so beside the
// specification and offers the subtypes as a list.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema, type IfcVersion, type SchemaData } from '@idsbench/check/ifc';
import { checkText } from '../src/core/checkview';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { addSubtypes, familyOf, subtypeAction, subtypeNote } from '../src/core/subtypes';
import { describeSpecification } from '../src/core/ids/words';
import { idsText, ifcText, line, nameIs, runText, specXml } from './helpers/small-model';
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
  it('names the subtypes of every ticked version, and none of a version that is not ticked; it offers to add them all, also those only one ticked version has', async () => {
    expect(subtypeNote(specOf('IFCSLAB', 'IFC2X3'), await schemas('IFC2X3'))).toBeNull();
    expect(subtypeNote(specOf('IFCSLAB'), await schemas('IFC4'))?.text).toBe('This applies to IfcSlab only, not to IfcSlabElementedCase or IfcSlabStandardCase.');
    // IFC2X3 has no subtype of IfcSlab: with both versions ticked the two of IFC4 are named and offered, because an IFC4
    // model is checked against this specification too, and its IfcSlabStandardCase slabs would be passed over.
    const both = subtypeNote(specOf('IFCSLAB', 'IFC2X3 IFC4'), await schemas('IFC2X3', 'IFC4'))!;
    expect(both.subtypes.map((s) => s.name)).toEqual(['IfcSlabElementedCase', 'IfcSlabStandardCase']);
    expect(both.partial).toEqual([]);
    expect(both.text).toBe('This applies to IfcSlab only, not to IfcSlabElementedCase or IfcSlabStandardCase.');
    expect(subtypeAction(both)).toBe('Also apply it to the 2 subtypes');
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
    // Without the tables a class the sentence has no plain name for is named as it is written; with them it is a family.
    expect(describeSpecification(changed).text).toBe('The model must contain at least one wall or element of class IFCWALLELEMENTEDCASE or element of class IFCWALLSTANDARDCASE.');
    const family = familyOf(changed, [schema]);
    expect(family).toEqual({ head: 'IFCWALL', others: ['IFCWALLELEMENTEDCASE', 'IFCWALLSTANDARDCASE'] });
    expect(describeSpecification(changed, { family, className: (u) => schema.classes.get(u)?.name }).text)
      .toBe('The model must contain at least one wall, including wall elemented case and wall standard case.');
  });
});

// With several versions ticked the list holds the subtypes of each of them, but for a class that another ticked version puts under a different class.
describe('the subtypes offered, for each IFC version and for several ticked together', () => {
  const combos: IfcVersion[][] = [['IFC2X3'], ['IFC4'], ['IFC4X3_ADD2'], ['IFC2X3', 'IFC4'], ['IFC4', 'IFC4X3_ADD2'], ['IFC2X3', 'IFC4X3_ADD2'], ['IFC2X3', 'IFC4', 'IFC4X3_ADD2']];
  for (const combo of combos) {
    it(`${combo.join(' + ')}: for every class, exactly the concrete subtypes of any ticked version that no ticked version has under another class`, async () => {
      const all = await schemas(...combo);
      const classes = new Set(all.flatMap((s) => [...s.classes].filter(([, c]) => c.kind !== 'enumeration').map(([u]) => u)));
      let offers = 0;
      for (const c of classes) {
        const note = subtypeNote(specOf(c, combo.join(' ')), all);
        // Worked out here from the tables alone: a class is a subtype in a version when it is concrete there and has `c` above it.
        const subtypeIn = (s: SchemaData, u: string) => s.classes.get(u)?.kind === 'concrete' && s.classes.has(c) && s.isA(u, c);
        // A class that some ticked version does not have brings none in (the engine refuses the name for that version).
        const expected = !all.every((s) => s.classes.has(c)) ? [] : [...classes].filter((u) => u !== c && all.some((s) => subtypeIn(s, u)) && all.every((s) => s.classes.get(u)?.kind !== 'concrete' || subtypeIn(s, u))).sort();
        expect((note?.subtypes ?? []).map((x) => x.upper).sort(), c).toEqual(expected);
        offers += expected.length ? 1 : 0;
        // Everything offered is a class an element can be in some ticked version (IfcBoundedSurface is one in IFC2X3 and abstract in IFC4: there it matches nothing, which is right).
        for (const x of note?.subtypes ?? []) expect(all.some((s) => s.classes.get(x.upper)?.kind === 'concrete'), x.upper).toBe(true);
        // And what is named but not offered is a subtype in some ticked version and a class under something else in another.
        for (const x of note?.partial ?? []) expect(all.some((s) => subtypeIn(s, x.upper)) && all.some((s) => s.classes.get(x.upper)?.kind === 'concrete' && !subtypeIn(s, x.upper)), `${c}: ${x.upper}`).toBe(true);
      }
      expect(offers).toBeGreaterThan(100);
    });
  }
  it('IFC2X3 and IFC4 ticked: IfcWallStandardCase, which both have, and IfcWallElementedCase, which only IFC4 has, are both offered, and the list is accepted by the Check engine', async () => {
    const note = subtypeNote(specOf('IFCWALL', 'IFC2X3 IFC4'), await schemas('IFC2X3', 'IFC4'))!;
    expect(note.subtypes.map((x) => x.name)).toEqual(['IfcWallElementedCase', 'IfcWallStandardCase']);
    expect(note.text).toBe('This applies to IfcWall only, not to IfcWallElementedCase or IfcWallStandardCase.');
    expect(subtypeAction(note)).toBe('Also apply it to the 2 subtypes');
    const doc = readIdsText(idsText(specXml('S', 'IFCWALL', undefined, nameIs('x'), 'IFC2X3 IFC4')), nodeEnv);
    const changed = addSubtypes(doc.specifications[0], note);
    const entity = changed.applicability[0];
    expect(entity.kind === 'entity' && entity.name.kind === 'restriction' && entity.name.facets.map((f) => f.value)).toEqual(['IFCWALL', 'IFCWALLELEMENTEDCASE', 'IFCWALLSTANDARDCASE']);
    // Nothing is left out any more, so the line goes.
    expect(subtypeNote(changed, await schemas('IFC2X3', 'IFC4'))).toBeNull();
    const v = await checkText(writeIds({ ...doc, specifications: [changed] }));
    expect(v.kind === 'report' && v.errors).toBe(0);
  });
});

// IfcElement, IfcBuildingElement and the like are abstract: no entity of a model is one of them, so a specification for one applies to nothing.
describe('a class that is abstract', () => {
  const G = (i: number) => String(i).padStart(22, '0');
  const three = (schema: string) => ifcText(line(1, 'IFCWALL', 'a wall') + line(2, 'IFCWALLSTANDARDCASE', 'a subtype of it') + `#3=IFCSPACE('${G(3)}',$,'not an element of the building',$,$,$,$,$,$,$,$);\n`, schema);
  const valid = async (xml: string) => { const v = await checkText(xml); return v.kind === 'report' && v.errors === 0; };

  it('is said to match nothing, with its subtypes offered in its place', async () => {
    const note = subtypeNote(specOf('IFCBUILDINGELEMENT'), await schemas('IFC4'))!;
    expect(note.abstract.map((a) => a.name)).toEqual(['IfcBuildingElement']);
    expect(note.text).toBe('IfcBuildingElement is an abstract class: a model never holds an element that is IfcBuildingElement itself, only its subtypes, so this specification applies to nothing as it is written.');
    expect(subtypeAction(note)).toBe(`Apply it to the ${note.subtypes.length} subtypes instead`);
    expect(note.subtypes.map((x) => x.upper)).toContain('IFCWALLSTANDARDCASE');
    expect(note.subtypes.map((x) => x.upper)).not.toContain('IFCBUILDINGELEMENT');
  });
  it('named beside a class that is not: the line says both, and the action adds to what applies', async () => {
    const list = specXml('S', 'IFCWALL', undefined, '').replace('<simpleValue>IFCWALL</simpleValue>', '<xs:restriction base="xs:string"><xs:enumeration value="IFCFEATUREELEMENT"/><xs:enumeration value="IFCSLAB"/></xs:restriction>');
    const note = subtypeNote(readIdsText(idsText(list), nodeEnv).specifications[0], await schemas('IFC4'))!;
    expect(note.text).toMatch(/^IfcFeatureElement is an abstract class: a model never holds an element that is IfcFeatureElement itself, only its subtypes\. This applies to IfcSlab only, not to /);
    expect(subtypeAction(note)).toMatch(/^Also apply it to the \d+ subtypes$/);
  });
  for (const [version, schema, abstractClass] of [['IFC2X3', 'IFC2X3', 'IFCBUILDINGELEMENT'], ['IFC4', 'IFC4', 'IFCBUILDINGELEMENT'], ['IFC4X3_ADD2', 'IFC4X3_ADD2', 'IFCELEMENT'], ['IFC2X3 IFC4', 'IFC4', 'IFCELEMENT'], ['IFC2X3 IFC4 IFC4X3_ADD2', 'IFC2X3', 'IFCELEMENT']] as const) {
    it(`${version}, ${abstractClass}: as written it applies to nothing in a model with a wall, a subtype of wall and a space; with its subtypes in its place it applies to the two walls and not to the space, and the Check engine accepts the file`, async () => {
      const all = await schemas(...(version.split(' ') as IfcVersion[]));
      const doc = readIdsText(idsText(specXml('elements are named', abstractClass, undefined, nameIs('a wall'), version)), nodeEnv);
      const before = await runText(writeIds(doc), three(schema));
      expect([before.specs[0].state, before.specs[0].applicable]).toEqual(['fail', 0]);
      const note = subtypeNote(doc.specifications[0], all)!;
      expect(note.abstract).toHaveLength(1);
      const changed = { ...doc, specifications: [addSubtypes(doc.specifications[0], note)] };
      const entity = changed.specifications[0].applicability[0];
      const listed = entity.kind === 'entity' && entity.name.kind === 'restriction' ? entity.name.facets.map((f) => f.value) : [];
      // The abstract class is not in the list: it could never match.
      expect(listed).not.toContain(abstractClass);
      for (const u of listed) expect(all.some((s) => s.classes.get(u)?.kind === 'concrete'), u).toBe(true);
      const xml = writeIds(changed);
      expect(await valid(xml)).toBe(true);
      const after = await runText(xml, three(schema));
      expect([after.specs[0].state, after.specs[0].applicable, after.specs[0].passed, after.specs[0].failed]).toEqual(['fail', 2, 1, 1]);
      expect(after.specs[0].failures.map((f) => f.ifcClass)).toEqual(['IfcWallStandardCase']);
      expect(subtypeNote(changed.specifications[0], all)?.abstract ?? []).toEqual([]);
    });
  }
  for (const [version, schema] of [['IFC2X3', 'IFC2X3'], ['IFC4', 'IFC4'], ['IFC4X3_ADD2', 'IFC4X3_ADD2'], ['IFC2X3 IFC4', 'IFC2X3'], ['IFC2X3 IFC4 IFC4X3_ADD2', 'IFC4X3_ADD2']] as const) {
    it(`${version}, IFCWALL: before, it applies to the wall only; after "Also apply it to", to the wall and its subtype and not to the space; the Check engine accepts the file`, async () => {
      const all = await schemas(...(version.split(' ') as IfcVersion[]));
      const doc = readIdsText(idsText(specXml('walls are named', 'IFCWALL', undefined, nameIs('a wall'), version)), nodeEnv);
      expect((await runText(writeIds(doc), three(schema))).specs[0].applicable).toBe(1);
      const note = subtypeNote(doc.specifications[0], all)!;
      expect(note.subtypes.map((x) => x.upper)).toContain('IFCWALLSTANDARDCASE');
      const xml = writeIds({ ...doc, specifications: [addSubtypes(doc.specifications[0], note)] });
      expect(await valid(xml)).toBe(true);
      const after = await runText(xml, three(schema));
      expect([after.specs[0].applicable, after.specs[0].failures.map((f) => f.ifcClass)]).toEqual([2, ['IfcWallStandardCase']]);
    });
  }
});
