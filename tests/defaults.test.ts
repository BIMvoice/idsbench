// What a specification made by this page says before the person has changed anything: it applies to the class and its
// subtypes, in every IFC version, and does not fail a model for having none of them; the starting shapes hold no value
// that narrows the rule beyond its title; the name follows the content until a name is typed.
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema } from '@idsbench/check/ifc';
import { checkIds } from '@idsbench/check';
import { blankDocument, IFC_VERSIONS, newFacet, newSpecification, simple, specChoice, type Facet, type Specification } from '../src/core/ids/model';
import { suggestName, syncName } from '../src/core/ids/naming';
import { PATTERNS } from '../src/core/ids/patterns';
import { describeSpecification } from '../src/core/ids/words';
import { writeIds } from '../src/core/ids/write';
import { familyOf, narrowToHead, withDefaultSubtypes } from '../src/core/subtypes';
import { ifcText, line, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const fixture = (f: string) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const tables = Promise.all(IFC_VERSIONS.map((v) => loadSchema(v)));
const className = async () => { const t = await tables; return (u: string) => t.map((s) => s.classes.get(u)?.name).find(Boolean); };
const doc = (...s: Specification[]) => ({ ...blankDocument(), info: { ...blankDocument().info, title: 't' }, specifications: s });
/** A specification as the page makes it when a starting shape is chosen. */
const started = async (p: (typeof PATTERNS)[number]) => syncName(withDefaultSubtypes(p.make(), await tables), { className: await className() });

describe('a new specification', () => {
  it('ticks all three IFC versions and does not demand that the model has the element (optional)', () => {
    const s = newSpecification();
    expect(s.ifcVersion).toEqual(['IFC2X3', 'IFC4', 'IFC4X3_ADD2']);
    expect(specChoice(s)).toBe('optional');
    expect(s.made).toBe(true);
  });

  it('every starting shape: optional, three versions, and one of them (the proxies) prohibited', () => {
    expect(PATTERNS.map((p) => specChoice(p.make()))).toEqual(['optional', 'optional', 'optional', 'optional', 'prohibited']);
    expect(PATTERNS.every((p) => p.make().ifcVersion.length === 3)).toBe(true);
  });
});

describe('the starting shapes hold no value that narrows the rule beyond its title', () => {
  const values = (f: Facet): unknown[] => ('value' in f ? [f.value] : []);
  for (const p of PATTERNS) {
    it(`${p.id}: no text pattern, no exact value, no list, no range in any facet`, () => {
      const s = p.make();
      for (const f of [...s.applicability, ...s.requirements]) {
        for (const v of values(f)) expect(v, `${p.id} ${f.kind}`).toBeNull();
        if (f.kind === 'entity') expect(f.predefinedType).toBeNull();
      }
    });
  }
  it('"named a certain way" starts as "must have a name": the attribute Name with any value', () => {
    const p = PATTERNS.find((x) => x.id === 'name')!;
    const s = p.make();
    expect(s.requirements).toHaveLength(1);
    expect(s.requirements[0]).toMatchObject({ kind: 'attribute', name: { kind: 'simple', value: 'Name' }, value: null, cardinality: 'required' });
    expect(describeSpecification(s).text).toBe('Every space must have the attribute Name.');
    expect(JSON.stringify(s)).not.toMatch(/L\[0-9\]/);
  });
});

describe('every starting shape as the page makes it is accepted by the Check engine', () => {
  for (const p of PATTERNS) {
    it(`${p.id}`, async () => {
      const s = await started(p);
      const errors = (await checkIds(writeIds(doc(s)))).findings.filter((f) => f.severity === 'error');
      expect(errors).toEqual([]);
    });
  }
});

describe('the class and its subtypes', () => {
  it('"every wall" applies to IfcWall and IfcWallStandardCase in all three versions (the subtypes every version has)', async () => {
    const s = await started(PATTERNS[0]);
    const entity = s.applicability[0];
    expect(entity.kind === 'entity' && entity.name.kind === 'restriction' && entity.name.facets.map((f) => f.value)).toEqual(['IFCWALL', 'IFCWALLSTANDARDCASE']);
    const family = familyOf(s, await tables);
    expect(family).toEqual({ head: 'IFCWALL', others: ['IFCWALLSTANDARDCASE'] });
    expect(describeSpecification(s, { family, className: await className() }).text).toBe('Every wall, including wall standard case, must have the property FireRating in Pset_WallCommon.');
  });

  it('a class without subtypes stays one class, and says so in the sentence as before', async () => {
    const s = await started(PATTERNS[3]);
    const entity = s.applicability[0];
    expect(entity.kind === 'entity' && entity.name).toEqual(simple('IFCSPACE'));
  });

  it('many subtypes read short: "Every flow segment (and its 5 subtypes)"', async () => {
    const t = await Promise.all([loadSchema('IFC4X3_ADD2')]);
    const s = withDefaultSubtypes({ ...newSpecification(), ifcVersion: ['IFC4X3_ADD2'], applicability: [{ ...newFacet('entity', 'applicability'), name: simple('IFCFLOWSEGMENT') } as Facet], requirements: [] }, t);
    const words = describeSpecification({ ...s, requirements: [{ ...newFacet('material', 'requirements') } as Facet] }, { family: familyOf(s, t), className: (u) => t[0].classes.get(u)?.name });
    expect(words.text).toBe('Every flow segment (and its 5 subtypes) must have a material.');
  });

  it('can be narrowed to the exact class again', async () => {
    const s = await started(PATTERNS[0]);
    const narrow = narrowToHead(s, familyOf(s, await tables)!);
    const entity = narrow.applicability[0];
    expect(entity.kind === 'entity' && entity.name).toEqual(simple('IFCWALL'));
  });

  it('a model whose walls are all IfcWallStandardCase: the failing walls are named (they were not before)', async () => {
    const wall = (await started(PATTERNS[0]));
    const model = fixture('ifc2x3-standardcase-walls.ifc');
    const exact = narrowToHead(wall, familyOf(wall, await tables)!);
    const before = await runText(writeIds(doc(exact)), model);
    const after = await runText(writeIds(doc(wall)), model);
    expect(before.specs[0]).toMatchObject({ state: 'nothing', applicable: 0, failed: 0 });
    expect(after.specs[0]).toMatchObject({ state: 'fail', applicable: 3, passed: 1, failed: 2 });
    expect(after.specs[0].failures.map((f) => f.name)).toEqual(['SC wall fail 1', 'SC wall fail 2']);
  });
});

describe('the existence of the element is not demanded unless the person chooses it', () => {
  it('a model with no doors does not fail "Doors are classified"; the exact same specification made required does', async () => {
    const door = await started(PATTERNS[1]);
    const model = fixture('ifc2x3-standardcase-walls.ifc');
    expect((await runText(writeIds(doc(door)), model)).specs[0]).toMatchObject({ state: 'nothing' });
    const demanding = { ...door, minOccurs: '1', maxOccurs: 'unbounded' };
    expect((await runText(writeIds(doc(demanding)), model)).specs[0]).toMatchObject({ state: 'fail' });
  });
});

describe('the name follows the content until a name is typed', () => {
  it('worked out from the content', async () => {
    const o = { className: await className() };
    expect((await Promise.all(PATTERNS.map((p) => started(p)))).map((s) => s.name)).toEqual([
      'Walls have a fire rating', 'Doors are classified in Uniclass 2015', 'Slabs have a material', 'Spaces have a name', 'No building element proxies',
    ]);
    expect(suggestName({ ...newSpecification(), applicability: [], requirements: [] }, o)).toBe('');
  });

  it('follows a changed class and a changed requirement while it is the generated one', async () => {
    const o = { className: await className() };
    const s = await started(PATTERNS[3]);
    expect(s.name).toBe('Spaces have a name');
    const changed = syncName({ ...s, applicability: [{ ...s.applicability[0], name: simple('IFCDOOR') } as Facet], requirements: [{ ...newFacet('classification', 'requirements'), system: simple('Uniclass 2015') } as Facet] }, o);
    expect(changed.name).toBe('Doors are classified in Uniclass 2015');
  });

  it('is never touched once the person has typed a name (autoName is off)', async () => {
    const o = { className: await className() };
    const s = await started(PATTERNS[3]);
    const typed: Specification = { ...s, name: 'Room naming', autoName: undefined };
    const changed = syncName({ ...typed, applicability: [{ ...s.applicability[0], name: simple('IFCDOOR') } as Facet] }, o);
    expect(changed.name).toBe('Room naming');
  });

  it('a specification read from a file has no generated name and is never renamed', () => {
    const read: Specification = { ...newSpecification(), made: undefined, name: 'Spaces are named by level', applicability: [{ ...newFacet('entity', 'applicability'), name: simple('IFCDOOR') } as Facet] };
    expect(syncName(read).name).toBe('Spaces are named by level');
  });
});

describe('a specification the page makes, run against models (Job 3 of the walk-through)', () => {
  it('"no building element proxies": passes without proxies, fails with them', async () => {
    const s = await started(PATTERNS[4]);
    const withProxy = fixture('small-with-proxy.ifc');
    expect((await runText(writeIds(doc(s)), ifcText(line(1, 'IFCWALL', 'w', '$,$,$,$,$,$'), 'IFC4'))).specs[0].state).toBe('pass');
    expect(withProxy).toBeTruthy();
  });
});
