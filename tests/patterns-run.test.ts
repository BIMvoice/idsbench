// Each of the five starting patterns, with each choice the form offers next, against a small model that meets it and
// one that does not: the verdict is the one the sentence promises, and the sentence says what the file tests.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PATTERNS } from '../src/core/ids/patterns';
import { blankDocument, newFacet, newSpecification, occursFor, simple, type Cardinality, type Facet, type Specification } from '../src/core/ids/model';
import { fromList, fromPattern } from '../src/core/ids/value';
import { describeSpecification } from '../src/core/ids/words';
import { writeIds } from '../src/core/ids/write';
import { ifcText, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const G = (n: number) => String(n).padStart(22, '0');
const wall = (i: number, name = 'W') => `#${i}=IFCWALL('${G(i)}',$,'${name}',$,$,$,$,$,$);\n`;
const door = (i: number) => `#${i}=IFCDOOR('${G(i)}',$,'D',$,$,$,$,$,$,$,$,$,$);\n`;
const slab = (i: number) => `#${i}=IFCSLAB('${G(i)}',$,'S',$,$,$,$,$,$);\n`;
const space = (i: number, name: string) => `#${i}=IFCSPACE('${G(i)}',$,'${name}',$,$,$,$,$,$,$,$);\n`;
const proxy = (i: number, type = '.NOTDEFINED.') => `#${i}=IFCBUILDINGELEMENTPROXY('${G(i)}',$,'P',$,$,$,$,$,${type});\n`;
/** A property set with one single-value property, attached to element #of. */
const prop = (of: number, set: string, name: string, value: string) =>
  `#${of + 100}=IFCPROPERTYSINGLEVALUE('${name}',$,IFCLABEL('${value}'),$);\n#${of + 200}=IFCPROPERTYSET('${G(of + 200)}',$,'${set}',$,(#${of + 100}));\n#${of + 300}=IFCRELDEFINESBYPROPERTIES('${G(of + 300)}',$,$,$,(#${of}),#${of + 200});\n`;
const classified = (of: number, system: string, code: string) =>
  `#${of + 400}=IFCCLASSIFICATION('src',$,$,'${system}',$,$,$);\n#${of + 401}=IFCCLASSIFICATIONREFERENCE($,'${code}',$,#${of + 400},$,$);\n#${of + 402}=IFCRELASSOCIATESCLASSIFICATION('${G(of + 402)}',$,$,$,(#${of}),#${of + 401});\n`;
const material = (of: number, name: string) => `#${of + 500}=IFCMATERIAL('${name}',$,$);\n#${of + 501}=IFCRELASSOCIATESMATERIAL('${G(of + 501)}',$,$,$,(#${of}),#${of + 500});\n`;

interface Choice { title: string; change: (s: Specification) => Specification; says: string; meets: string; fails: string; }
const req = (s: Specification, i: number, f: Partial<Facet>) => ({ ...s, requirements: s.requirements.map((r, j) => (j === i ? ({ ...r, ...f } as Facet) : r)) });
const card = (c: Cardinality) => (s: Specification) => req(s, 0, { cardinality: c } as never);

/** What each pattern is, then the choices that follow it. `meets` and `fails` are bodies of IFC4 models. */
const PLAN: Record<string, { says: string; meets: string; fails: string; choices: Choice[] }> = {
  property: {
    says: 'Every wall must have the property FireRating in Pset_WallCommon.',
    meets: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '2HR'), fails: wall(1),
    choices: [
      { title: 'a value', change: (s) => req(s, 0, { value: simple('2HR') } as never), says: 'Every wall must have the property FireRating in Pset_WallCommon set to "2HR".', meets: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '2HR'), fails: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '1HR') },
      { title: 'a list of values', change: (s) => req(s, 0, { value: fromList(['1HR', '2HR'], 'xs:string') } as never), says: 'Every wall must have the property FireRating in Pset_WallCommon set to one of "1HR", "2HR".', meets: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '1HR'), fails: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '3HR') },
      { title: 'a pattern', change: (s) => req(s, 0, { value: fromPattern('[0-9]HR', 'xs:string') } as never), says: 'Every wall must have the property FireRating in Pset_WallCommon with a value matching the pattern "[0-9]HR".', meets: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '2HR'), fails: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', 'two hours') },
      { title: 'the item optional', change: (s) => card('optional')(req(s, 0, { value: simple('2HR') } as never)), says: 'Every wall may have the property FireRating in Pset_WallCommon set to "2HR" (an optional item only has to match when the element has it).', meets: wall(1), fails: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '1HR') },
      { title: 'the item prohibited', change: (s) => card('prohibited')(req(s, 0, {} as never)), says: 'Every wall must not have the property FireRating in Pset_WallCommon.', meets: wall(1), fails: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '2HR') },
      { title: 'the specification required', change: (s) => ({ ...s, ...occursFor('required') }), says: 'Every wall must have the property FireRating in Pset_WallCommon. The model must contain at least one wall.', meets: wall(1) + prop(1, 'Pset_WallCommon', 'FireRating', '2HR'), fails: slab(1) },
      { title: 'the specification prohibited', change: (s) => ({ ...s, ...occursFor('prohibited') }), says: 'The model must not contain any wall.', meets: slab(1), fails: wall(1) },
    ],
  },
  classification: {
    says: 'Every door must have a classification in Uniclass 2015.',
    meets: door(1) + classified(1, 'Uniclass 2015', 'Ss_25_10'), fails: door(1) + classified(1, 'OmniClass', '23-17 11 00'),
    choices: [
      { title: 'a code', change: (s) => req(s, 0, { value: simple('Ss_25_10') } as never), says: 'Every door must have a classification in Uniclass 2015 with the code "Ss_25_10".', meets: door(1) + classified(1, 'Uniclass 2015', 'Ss_25_10'), fails: door(1) + classified(1, 'Uniclass 2015', 'Ss_30') },
      { title: 'a list of codes', change: (s) => req(s, 0, { value: fromList(['Ss_25_10', 'Ss_25_20'], 'xs:string') } as never), says: 'Every door must have a classification in Uniclass 2015 with the code one of "Ss_25_10", "Ss_25_20".', meets: door(1) + classified(1, 'Uniclass 2015', 'Ss_25_20'), fails: door(1) + classified(1, 'Uniclass 2015', 'Ss_99') },
      { title: 'the item optional', change: card('optional'), says: 'Every door may have a classification in Uniclass 2015 (an optional item only has to match when the element has it).', meets: door(1), fails: door(1) + classified(1, 'OmniClass', 'x') },
      { title: 'the specification prohibited', change: (s) => ({ ...s, ...occursFor('prohibited') }), says: 'The model must not contain any door.', meets: wall(1), fails: door(1) },
    ],
  },
  material: {
    says: 'Every slab must have a material.',
    meets: slab(1) + material(1, 'Concrete'), fails: slab(1),
    choices: [
      { title: 'a named material', change: (s) => req(s, 0, { value: simple('Concrete') } as never), says: 'Every slab must have the material "Concrete".', meets: slab(1) + material(1, 'Concrete'), fails: slab(1) + material(1, 'Timber') },
      { title: 'one of several materials', change: (s) => req(s, 0, { value: fromList(['Concrete', 'Steel'], 'xs:string') } as never), says: 'Every slab must have the material one of "Concrete", "Steel".', meets: slab(1) + material(1, 'Steel'), fails: slab(1) + material(1, 'Timber') },
      { title: 'the specification required', change: (s) => ({ ...s, ...occursFor('required') }), says: 'Every slab must have a material. The model must contain at least one slab.', meets: slab(1) + material(1, 'Concrete'), fails: wall(1) },
      { title: 'the specification prohibited', change: (s) => ({ ...s, ...occursFor('prohibited') }), says: 'The model must not contain any slab.', meets: wall(1), fails: slab(1) },
    ],
  },
  name: {
    says: 'Every space must have the attribute Name.',
    meets: space(1, 'Hall'), fails: `#1=IFCSPACE('${G(1)}',$,$,$,$,$,$,$,$,$,$);\n`,
    choices: [
      { title: 'an exact name', change: (s) => req(s, 0, { value: simple('L01 Hall') } as never), says: 'Every space must have the attribute Name set to "L01 Hall".', meets: space(1, 'L01 Hall'), fails: space(1, 'L02 Hall') },
      { title: 'a list of names', change: (s) => req(s, 0, { value: fromList(['Hall', 'Lobby'], 'xs:string') } as never), says: 'Every space must have the attribute Name set to one of "Hall", "Lobby".', meets: space(1, 'Lobby'), fails: space(1, 'Office') },
      { title: 'a pattern, which is a choice after the start', change: (s) => req(s, 0, { value: fromPattern('L[0-9]{2}.*', 'xs:string') } as never), says: 'Every space must have the attribute Name with a value matching the pattern "L[0-9]{2}.*".', meets: space(1, 'L01 Hall'), fails: space(1, 'Hall') },
      { title: 'the specification required', change: (s) => ({ ...s, ...occursFor('required') }), says: 'Every space must have the attribute Name. The model must contain at least one space.', meets: space(1, 'Hall'), fails: wall(1) },
    ],
  },
  prohibited: {
    says: 'The model must not contain any element of class IFCBUILDINGELEMENTPROXY.',
    meets: wall(1), fails: proxy(1),
    choices: [
      { title: 'only of one predefined type', change: (s) => ({ ...s, applicability: s.applicability.map((f) => (f.kind === 'entity' ? { ...f, predefinedType: simple('COMPLEX') } : f)) }), says: 'The model must not contain any element of class IFCBUILDINGELEMENTPROXY of type "COMPLEX".', meets: proxy(1, '.ELEMENT.'), fails: proxy(1, '.COMPLEX.') },
      { title: 'required instead (the model must have one)', change: (s) => ({ ...s, ...occursFor('required') }), says: 'The model must contain at least one element of class IFCBUILDINGELEMENTPROXY.', meets: proxy(1), fails: wall(1) },
    ],
  },
};

const docOf = (s: Specification) => ({ ...blankDocument(), info: { ...blankDocument().info, title: 't' }, specifications: [s] });
const verdictOf = async (s: Specification, body: string) => (await runText(writeIds(docOf(s)), ifcText(body))).verdict;

describe('each starting pattern against a model that meets it and one that does not', () => {
  for (const p of PATTERNS) {
    const plan = PLAN[p.id];
    it(`${p.id}: the plan covers this pattern`, () => expect(plan).toBeDefined());
    it(`${p.id}: as it starts, the sentence says what the file tests; the model that meets it passes and the other fails`, async () => {
      const s = p.make();
      expect(describeSpecification(s)).toEqual({ mode: 'sentence', text: plan.says });
      expect(await verdictOf(s, plan.meets)).toBe('pass');
      expect(await verdictOf(s, plan.fails)).toBe('fail');
    });
    for (const c of plan.choices) {
      it(`${p.id}, ${c.title}: the sentence follows the choice and the run agrees with it`, async () => {
        const s = c.change(p.make());
        expect(describeSpecification(s)).toEqual({ mode: 'sentence', text: c.says });
        expect(await verdictOf(s, c.meets)).toBe('pass');
        expect(await verdictOf(s, c.fails)).toBe('fail');
      });
    }
  }
  it('all five patterns are covered, each with at least three runs', () => {
    expect(Object.keys(PLAN).sort()).toEqual(PATTERNS.map((p) => p.id).sort());
    expect(PATTERNS.map((p) => 2 + PLAN[p.id].choices.length).every((n) => n >= 4)).toBe(true);
  });
});

// ---- part of: the three relations the form offers for a part-of item, with a small model of each -------------------------
const building = (i: number) => `#${i}=IFCBUILDING('${G(i)}',$,'B',$,$,$,$,$,.ELEMENT.,$,$,$);\n`;
const storey = (i: number) => `#${i}=IFCBUILDINGSTOREY('${G(i)}',$,'S',$,$,$,$,$,.ELEMENT.,$);\n`;
const system = (i: number) => `#${i}=IFCSYSTEM('${G(i)}',$,'Sys',$,$);\n`;
const aggregates = (i: number, whole: number, part: number) => `#${i}=IFCRELAGGREGATES('${G(i)}',$,$,$,#${whole},(#${part}));\n`;
const contains = (i: number, structure: number, element: number) => `#${i}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${G(i)}',$,$,$,(#${element}),#${structure});\n`;
const groups = (i: number, group: number, member: number) => `#${i}=IFCRELASSIGNSTOGROUP('${G(i)}',$,$,$,(#${member}),$,#${group});\n`;

const partOfSpec = (subject: string, relation: string, whole: string, where: 'requirements' | 'applicability', extra: Partial<Specification> = {}): Specification => {
  const part = { ...newFacet('partOf', where), relation, entity: { name: simple(whole), predefinedType: null } } as Facet;
  const entity = { ...newFacet('entity', 'applicability'), name: simple(subject) } as Facet;
  return where === 'requirements'
    ? { ...newSpecification(), minOccurs: '1', name: 'S', applicability: [entity], requirements: [part], ...extra }
    : { ...newSpecification(), minOccurs: '1', name: 'S', applicability: [entity, part], requirements: [], ...extra };
};

describe('part of, in the sentence and in the run', () => {
  const cases: { title: string; spec: Specification; says: string; meets: string; fails: string }[] = [
    {
      title: 'aggregation: a storey that must be a component of a building',
      spec: partOfSpec('IFCBUILDINGSTOREY', 'IFCRELAGGREGATES', 'IFCBUILDING', 'requirements'),
      says: 'Every building storey must be a component of a building. The model must contain at least one building storey.',
      meets: building(1) + storey(2) + aggregates(3, 1, 2), fails: building(1) + storey(2),
    },
    {
      title: 'containment: a wall that must be located in a building storey',
      spec: partOfSpec('IFCWALL', 'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCBUILDINGSTOREY', 'requirements'),
      says: 'Every wall must be located in a building storey. The model must contain at least one wall.',
      meets: storey(1) + wall(2) + contains(3, 1, 2), fails: storey(1) + wall(2),
    },
    {
      title: 'group: a wall that must be a member of a system',
      spec: partOfSpec('IFCWALL', 'IFCRELASSIGNSTOGROUP', 'IFCSYSTEM', 'requirements'),
      says: 'Every wall must be a member of a system. The model must contain at least one wall.',
      meets: system(1) + wall(2) + groups(3, 1, 2), fails: system(1) + wall(2),
    },
    {
      title: 'containment as a condition of the applicability: walls in a storey must be named Waldo',
      spec: { ...partOfSpec('IFCWALL', 'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCBUILDINGSTOREY', 'applicability'), requirements: [{ ...newFacet('attribute', 'requirements'), name: simple('Name'), value: simple('Waldo') } as Facet] },
      says: 'Every wall that is located in a building storey must have the attribute Name set to "Waldo". The model must contain at least one wall that is located in a building storey.',
      meets: storey(1) + wall(2, 'Waldo') + contains(3, 1, 2), fails: storey(1) + wall(2, 'Wilma') + contains(3, 1, 2),
    },
    {
      title: 'aggregation, prohibited: no storey may be a component of a building',
      spec: partOfSpec('IFCBUILDINGSTOREY', 'IFCRELAGGREGATES', 'IFCBUILDING', 'applicability', occursFor('prohibited')),
      says: 'The model must not contain any building storey that is a component of a building.',
      meets: building(1) + storey(2), fails: building(1) + storey(2) + aggregates(3, 1, 2),
    },
  ];
  for (const c of cases) {
    it(`${c.title}: the sentence is what the run tests`, async () => {
      expect(describeSpecification(c.spec)).toEqual({ mode: 'sentence', text: c.says });
      expect(await verdictOf(c.spec, c.meets)).toBe('pass');
      expect(await verdictOf(c.spec, c.fails)).toBe('fail');
    });
  }
  it('a relation the engine matches only through another one is not claimed: the sentence for the opening relations', () => {
    const s = partOfSpec('IFCWINDOW', 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT', 'IFCWALL', 'requirements');
    expect(describeSpecification(s).text).toBe('Every window must be in an opening of a wall. The model must contain at least one window.');
  });
});
