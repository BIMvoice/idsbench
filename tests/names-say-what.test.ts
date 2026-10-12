/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A name this page works out is the label of the specification in the results and in the CSV sent to the people who
// model. It must not be the name of another rule: "Walls have a fire rating" for a rule about walls and doors, about
// external walls only, or about a fire rating of one value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema } from '@idsbench/check/ifc';
import { checkIds } from '@idsbench/check';
import { blankDocument, newFacet, newSpecification, occursFor, simple, type Facet, type Specification, type Value } from '../src/core/ids/model';
import { pluralSubject, suggestName, syncName, withTypedName } from '../src/core/ids/naming';
import { fromList } from '../src/core/ids/value';
import { describeSpecification } from '../src/core/ids/words';
import { writeIds } from '../src/core/ids/write';
import { familyOf, subtypeNote, withDefaultSubtypes } from '../src/core/subtypes';
import { ifcText, line, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const entity = (name: Value, predefinedType: string | null = null): Facet =>
  ({ ...newFacet('entity', 'applicability'), name, predefinedType: predefinedType ? simple(predefinedType) : null } as Facet);
const fireRating = (value: string | null = null): Facet => ({ ...newFacet('property', 'requirements'), propertySet: simple('Pset_WallCommon'), baseName: simple('FireRating'), dataType: 'IFCLABEL', value: value ? simple(value) : null } as Facet);
const spec = (applicability: Facet[], requirements: Facet[], extra: Partial<Specification> = {}): Specification => ({ ...newSpecification(), autoName: true, applicability, requirements, ...extra });

describe('the generated name says which elements the rule is about', () => {
  it('one class: "Walls have a fire rating"', () => {
    expect(suggestName(spec([entity(simple('IFCWALL'))], [fireRating()]))).toBe('Walls have a fire rating');
  });
  it('a class and its subtypes is named by the class; two classes by both; a longer list of the person\'s own by the first and how many more', async () => {
    const t = [await loadSchema('IFC4')];
    const family = withDefaultSubtypes(spec([entity(simple('IFCWALL'))], [fireRating()]), t);
    expect(suggestName(family, { family: familyOf(family, t) })).toBe('Walls have a fire rating');
    expect(suggestName(spec([entity(fromList(['IFCWALL', 'IFCDOOR'], 'xs:string'))], [fireRating()]))).toBe('Walls and doors have a fire rating');
    const three = spec([entity(fromList(['IFCWALL', 'IFCDOOR', 'IFCWINDOW'], 'xs:string'))], [fireRating()]);
    expect(suggestName(three, { family: familyOf(three, t) })).toBe('Walls and 2 other classes have a fire rating');
    expect(pluralSubject(three)).toBe('walls and 2 other classes');
  });
  it('a rule for some of the elements of a class (a predefined type, another condition) is not named as the rule for all of them', () => {
    expect(suggestName(spec([entity(simple('IFCWALL'), 'PARTITIONING')], [fireRating()]))).toBe('Certain walls have a fire rating');
    const external: Facet = { ...newFacet('property', 'applicability'), propertySet: simple('Pset_WallCommon'), baseName: simple('IsExternal'), dataType: 'IFCBOOLEAN', value: simple('true') } as Facet;
    expect(suggestName(spec([entity(simple('IFCWALL')), external], [fireRating()]))).toBe('Certain walls have a fire rating');
    expect(suggestName(spec([entity(simple('IFCWALL')), external], [], occursFor('prohibited')))).toBe('No walls of a certain kind');
    expect(suggestName(spec([entity(simple('IFCWALL'))], [], occursFor('prohibited')))).toBe('No walls');
  });
  it('a requirement that says what the value must be is not named as if any value would do', () => {
    expect(suggestName(spec([entity(simple('IFCWALL'))], [fireRating('EI60')]))).toBe('Walls have a fire rating that meets the rule');
    const coded: Facet = { ...newFacet('classification', 'requirements'), system: simple('Uniclass 2015'), value: simple('EF_25_10') } as Facet;
    expect(suggestName(spec([entity(simple('IFCDOOR'))], [coded]))).toBe('Doors are classified in Uniclass 2015 with the code asked for');
    expect(suggestName(spec([entity(simple('IFCSLAB'))], [{ ...newFacet('material', 'requirements'), value: simple('concrete') } as Facet]))).toBe('Slabs have the material asked for');
  });
});

describe('a name the person typed is theirs', () => {
  const typed = (name: string): Specification => ({ ...spec([entity(simple('IFCWALL'))], [fireRating()]), name, autoName: undefined });
  it('is kept through every change of the content, also when it equals the name the page would give (a specification that carries no flag is not for the page to name)', () => {
    for (const name of ['FR-01', 'Walls have a fire rating', '']) {
      const s = typed(name);
      const changed = syncName({ ...s, applicability: [entity(simple('IFCDOOR'))], requirements: [] });
      expect(changed.name).toBe(name);
      expect(changed.autoName).toBeUndefined();
    }
  });
  it('survives the page being loaded again: the draft keeps whether the name is the page\'s or the person\'s', () => {
    const mine = JSON.parse(JSON.stringify(typed('FR-01'))) as Specification;
    const generated = JSON.parse(JSON.stringify({ ...spec([entity(simple('IFCWALL'))], [fireRating()]), name: 'Walls have a fire rating' })) as Specification;
    expect(syncName({ ...mine, applicability: [entity(simple('IFCDOOR'))] }).name).toBe('FR-01');
    expect(syncName({ ...generated, applicability: [entity(simple('IFCDOOR'))] }).name).toBe('Doors have a fire rating');
  });
});

describe('a name that is typed and then cleared goes back to following the content', () => {
  const made = (): Specification => ({ ...spec([entity(simple('IFCWALL'))], [fireRating()]), name: 'Walls have a fire rating', autoName: true });
  const toDoors = (s: Specification): Specification => ({ ...s, applicability: [entity(simple('IFCDOOR'))] });
  it('a name the person typed is kept through a change of the content', () => {
    const s = withTypedName(made(), 'FR-01');
    expect(s).toMatchObject({ name: 'FR-01' });
    expect(s.autoName).toBeUndefined();
    expect(syncName(toDoors(s)).name).toBe('FR-01');
  });
  it('the field emptied: the name is empty while it is being retyped, and follows the content from the next change of it', () => {
    const typed = withTypedName(made(), 'FR-01');
    const emptied = withTypedName(typed, '');
    expect(emptied).toMatchObject({ name: '', autoName: true });
    expect(syncName(emptied).name).toBe('Walls have a fire rating');
    expect(syncName(toDoors(emptied)).name).toBe('Doors have a fire rating');
    // A field of spaces is not a name either.
    expect(withTypedName(typed, '   ').autoName).toBe(true);
  });
  it('a name typed again after the field was emptied is the person\'s, and is never overwritten', () => {
    const again = withTypedName(withTypedName(withTypedName(made(), 'FR-01'), ''), 'FR-02');
    expect(again.name).toBe('FR-02');
    expect(again.autoName).toBeUndefined();
    expect(syncName(toDoors(again)).name).toBe('FR-02');
  });
  it('keeping the name the page worked out, or one typed over it and cleared, does not change what is written to the file', () => {
    const s = made();
    expect(JSON.stringify(withTypedName(s, s.name))).toContain('"name":"Walls have a fire rating"');
  });
});

describe('an abstract class typed into a specification this page makes', () => {
  it('IFCELEMENT with IFC4 ticked: the class stays at the head of its subtypes, so the sentence and the name are about elements, the engine accepts the file and a run applies it to the walls', async () => {
    const t = [await loadSchema('IFC4')];
    const name: Facet = { ...newFacet('attribute', 'requirements'), name: simple('Name') } as Facet;
    const wide = withDefaultSubtypes(spec([entity(simple('IFCELEMENT'))], [name], { ifcVersion: ['IFC4'] }), t);
    const e = wide.applicability[0];
    const listed = e.kind === 'entity' && e.name.kind === 'restriction' ? e.name.facets.map((f) => f.value) : [];
    expect(listed[0]).toBe('IFCELEMENT');
    expect(listed).toContain('IFCWALLSTANDARDCASE');
    const family = familyOf(wide, t);
    expect(family?.head).toBe('IFCELEMENT');
    const className = (u: string) => t[0].classes.get(u)?.name;
    expect(syncName(wide, { className, family }).name).toBe('Elements have a name');
    expect(describeSpecification(wide, { className, family }).text).toBe(`Every element (and its ${listed.length - 1} subtypes) must have the attribute Name.`);
    // Nothing is left to say about the abstract class: its subtypes are all in the list.
    expect(subtypeNote(wide, t)).toBeNull();
    const xml = writeIds({ ...blankDocument(), info: { ...blankDocument().info, title: 't' }, specifications: [{ ...wide, name: 'n' }] });
    expect((await checkIds(xml)).findings.filter((f) => f.severity === 'error')).toEqual([]);
    const r = await runText(xml, ifcText(line(1, 'IFCWALL', 'a') + line(2, 'IFCWALLSTANDARDCASE', 'b') + `#3=IFCSPACE('${'0'.repeat(21)}3',$,'s',$,$,$,$,$,$,$,$);\n`, 'IFC4'));
    expect(r.specs[0].applicable).toBe(2);
  });
  it('a class one ticked version does not have brings no subtypes in: IFCBUILDINGELEMENT with IFC4X3_ADD2 ticked stays as typed, for the engine to refuse', async () => {
    const t = [await loadSchema('IFC4'), await loadSchema('IFC4X3_ADD2')];
    const s = spec([entity(simple('IFCBUILDINGELEMENT'))], [], { ifcVersion: ['IFC4', 'IFC4X3_ADD2'] });
    expect(withDefaultSubtypes(s, t)).toBe(s);
  });
});
