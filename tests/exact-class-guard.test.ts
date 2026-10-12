/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The run library (@ifc-lite/ids 3.2.0 on @ifc-lite/parser 9.2.0) reads ten classes as their parent (their issue 7402).
// core/foldguard.ts and core/validate.ts make a run answer as IDS requires (the exact class the STEP line declares) where
// that can be proved, and withhold the result ("Not checked") where it cannot. The expectations below are the exact-class
// rule written down. They were also compared, element by element, with IfcTester over the same models
// (scripts/fold-vs-ifctester: the models of the three IFC versions that hold the ten classes, the parents or both, and
// every kind of specification below, in all three cardinalities): identical wherever a result is given.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { IfcParser } from '@ifc-lite/parser';
import { loadSchema, type IfcVersion, type SchemaData } from '@idsbench/check/ifc';
import { failuresCsvParts, parseCsv } from '../src/core/csv';
import { reportParts } from '../src/core/format';
import { CLASS_NAME, declaredFolded, FOLDED_ONTO, foldEffect, withheldSentence } from '../src/core/foldguard';
import { readIds } from '../src/core/validate';
import { idsText, ifcText, line, NS, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const VERSIONS: { v: IfcVersion; file: string }[] = [{ v: 'IFC2X3', file: 'IFC2X3' }, { v: 'IFC4', file: 'IFC4' }, { v: 'IFC4X3_ADD2', file: 'IFC4X3' }];
const TEN = Object.keys(FOLDED_ONTO);
const never = '<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>never-this</simpleValue></value></attribute></requirements>';
const names = (v: string[]) => (v.length === 1 ? `<simpleValue>${v[0]}</simpleValue>` : `<xs:restriction base="xs:string">${v.map((x) => `<xs:enumeration value="${x}"/>`).join('')}</xs:restriction>`);
const spec = (name: string, applicability: string, requirements = never, version = 'IFC4', occurs = 'minOccurs="1" maxOccurs="unbounded"') =>
  `<specification name="${name}" ifcVersion="${version}"><applicability ${occurs}>${applicability}</applicability>${requirements}</specification>`;
const entity = (v: string[], extra = '') => `<entity><name>${names(v)}</name>${extra}</entity>`;
const body = (classes: string[]) => classes.map((c, i) => line(i + 1, c, c)).join('');
/** The names of the elements a specification applied to (every one fails the requirement above, so each is listed). */
const appliedTo = (row: { failures: { name: string | null }[] }) => row.failures.map((f) => f.name).sort();

describe('the library still folds exactly these ten classes (the pin: when this fails the library is fixed, see scripts/engine-version.ts)', () => {
  for (const { v, file } of VERSIONS) {
    it(`${v}: of every concrete class of the tables, the library's own class for an element is the declared one but for the ten`, async () => {
      const s = await loadSchema(v);
      const concrete = [...s.classes.entries()].filter(([, c]) => c.kind === 'concrete').map(([u]) => u);
      const u = new TextEncoder().encode(ifcText(body(concrete), file));
      const store = await new IfcParser().parseColumnar(u.buffer as ArrayBuffer, {});
      const accessor = createDataAccessor(store);
      const folded = concrete.filter((c, i) => (accessor.getEntityType(i + 1) ?? '').toUpperCase() !== c);
      // The class the file declares is what the entity index keeps, whatever the accessor answers.
      expect(concrete.filter((c, i) => store.entityIndex.byId.get(i + 1)?.type !== c)).toEqual([]);
      const expected = TEN.filter((c) => concrete.includes(c));
      expect(folded.sort()).toEqual(expected.sort());
      for (const c of folded) expect((accessor.getEntityType(concrete.indexOf(c) + 1) ?? '').toUpperCase(), c).toBe(FOLDED_ONTO[c]);
      expect(declaredFolded((c) => (store.entityIndex.byType.get(c)?.length ?? 0))).toEqual(TEN.filter((c) => concrete.includes(c)));
    });
  }
});

describe('a specification that names the subtype, the parent or both applies to exactly the elements of the class the file declares', () => {
  for (const { v, file } of VERSIONS) {
    it(`${v}: every one of the ten classes that exists, with its parent in the same model`, async () => {
      const s: SchemaData = await loadSchema(v);
      const exists = (c: string) => s.classes.get(c)?.kind === 'concrete';
      const pairs = TEN.filter((c) => exists(c) && exists(FOLDED_ONTO[c])).map((c) => [c, FOLDED_ONTO[c]] as const);
      expect(pairs.length, v).toBeGreaterThanOrEqual(2);
      const classes = [...new Set([...pairs.flat(), 'IFCWALL'])];
      const model = ifcText(body(classes), file);
      const specs: { id: string; xml: string; want: string[] }[] = [];
      for (const [sub, par] of pairs) {
        specs.push(
          { id: `${sub} alone`, xml: spec(`${sub} alone`, entity([sub]), never, v), want: [sub] },
          { id: `${par} alone`, xml: spec(`${par} alone`, entity([par]), never, v), want: [par] },
          { id: `${sub} and ${par}`, xml: spec(`${sub} and ${par}`, entity([sub, par]), never, v), want: [par, sub].sort() },
          { id: `${sub} with other`, xml: spec(`${sub} with other`, entity([sub, 'IFCWALL']), never, v), want: ['IFCWALL', sub].sort() },
          { id: `${sub} with a name`, xml: spec(`${sub} with a name`, `${entity([sub])}<attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${sub}</simpleValue></value></attribute>`, never, v), want: [sub] },
          { id: `${par} unrelated`, xml: spec(`${par} unrelated`, entity(['IFCWALL']), never, v), want: ['IFCWALL'] },
        );
      }
      const result = await runText(idsText(...specs.map((x) => x.xml)), model);
      result.specs.forEach((row, i) => {
        expect(row.withheld, specs[i].id).toBeUndefined();
        expect(row.state, specs[i].id).not.toBe('unchecked');
        expect(appliedTo(row), `${v}: ${specs[i].id}`).toEqual(specs[i].want);
        expect(row.applicable, specs[i].id).toBe(specs[i].want.length);
      });
    }, 60_000);

    it(`${v}: the class has no element in the model, or the model has the class and the specification names another: nothing is changed, nothing withheld`, async () => {
      const s = await loadSchema(v);
      for (const sub of TEN.filter((c) => s.classes.get(c)?.kind === 'concrete' && s.classes.get(FOLDED_ONTO[c])?.kind === 'concrete')) {
        const par = FOLDED_ONTO[sub];
        // has not: only the parent is there
        const without = await runText(idsText(spec('a', entity([sub]), never, v), spec('b', entity([par]), never, v), spec('c', entity([sub, par]), never, v)), ifcText(body([par, 'IFCWALL']), file));
        expect(without.specs.map((r) => r.withheld), sub).toEqual([undefined, undefined, undefined]);
        expect(without.specs.map(appliedTo), sub).toEqual([[], [par], [par]]);
        // has: the sub is there, the specification is about walls
        const wall = await runText(idsText(spec('w', entity(['IFCWALL']), never, v)), ifcText(body([sub, par, 'IFCWALL']), file));
        expect(wall.specs[0].withheld, sub).toBeUndefined();
        expect(appliedTo(wall.specs[0]), sub).toEqual(['IFCWALL']);
      }
    }, 60_000);
  }
});

describe('where the exact class cannot be proved the result is withheld: Not checked, never a Pass or a Fail', () => {
  const door = ifcText(body(['IFCDOORSTANDARDCASE', 'IFCDOOR', 'IFCWALL']), 'IFC4');
  const cases: [string, string][] = [
    ['a pattern that names the subtype only', spec('p', `<entity><name>${'<xs:restriction base="xs:string"><xs:pattern value="IFCDOORSTANDARDCASE"/></xs:restriction>'}</name></entity>`)],
    ['a pattern that names the parent only', spec('p', `<entity><name>${'<xs:restriction base="xs:string"><xs:pattern value="IFCDOOR"/></xs:restriction>'}</name></entity>`)],
    ['an entity facet among the requirements that names the parent', spec('p', entity(['IFCDOORSTANDARDCASE', 'IFCDOOR']), `<requirements>${entity(['IFCDOOR'])}</requirements>`)],
    ['an entity facet among the requirements that names the subtype', spec('p', entity(['IFCDOORSTANDARDCASE', 'IFCDOOR']), `<requirements>${entity(['IFCDOORSTANDARDCASE'])}</requirements>`)],
    ['a predefined type beside the subtype', spec('p', entity(['IFCDOORSTANDARDCASE'], '<predefinedType><simpleValue>DOOR</simpleValue></predefinedType>'))],
    ['a predefined type beside the parent', spec('p', entity(['IFCDOOR'], '<predefinedType><simpleValue>DOOR</simpleValue></predefinedType>'))],
    ['a partOf facet whose entity names the parent', spec('p', `${entity(['IFCWALL'])}<partOf relation="IFCRELAGGREGATES">${entity(['IFCDOOR'])}</partOf>`)],
  ];
  for (const [what, xml] of cases) {
    it(`${what}`, async () => {
      const result = await runText(idsText(xml), door);
      const row = result.specs[0];
      expect(row.state).toBe('unchecked');
      expect(row.withheld).toBe(withheldSentence(['IFCDOORSTANDARDCASE']));
      expect(row.note).toBe(row.withheld);
      expect(row.applicable).toBe(0);
      expect(result.verdict).toBe('incomplete');
      expect(result.allPassed).toBe(false);
      expect(result.counts.notChecked).toBe(1);
      expect(row.withheld).toMatch(/IfcDoorStandardCase.*cannot tell.*IfcDoor.*withheld.*fixed engine version.*on its way/);
      // The same sentence in the CSV, as a "Whole specification" row, and in the report.
      const rows = parseCsv(failuresCsvParts(result).join(''));
      expect(rows.slice(1).map((r) => [r[0], r[1], r[3]])).toEqual([['Whole specification', 'p', row.withheld]]);
      expect(JSON.parse(reportParts(result).join('')).specs[0].withheld).toBe(row.withheld);
    });
  }

  it('the other specifications of the same file are still checked, and the headline does not say that all passed', async () => {
    const result = await runText(idsText(
      spec('pattern', '<entity><name><xs:restriction base="xs:string"><xs:pattern value="IFCDOOR"/></xs:restriction></name></entity>'),
      spec('walls', entity(['IFCWALL']), '', 'IFC4'),
    ), door);
    expect(result.specs.map((r) => r.state)).toEqual(['unchecked', 'pass']);
    expect(result.verdict).toBe('incomplete');
    expect(result.headline).toBe('1 of 2 specifications passed. 1 could not be checked.');
    expect(result.allPassed).toBe(false);
  });

  it('a pattern that reads the subtype and its parent alike is not withheld: IFCDOOR.* matches both, with the class the file declares', async () => {
    const wild = spec('p', '<entity><name><xs:restriction base="xs:string"><xs:pattern value="IFCDOOR.*"/></xs:restriction></name></entity>');
    const result = await runText(idsText(wild), door);
    expect(result.specs[0].withheld).toBeUndefined();
    expect(appliedTo(result.specs[0])).toEqual(['IFCDOOR', 'IFCDOORSTANDARDCASE']);
  });

  it('a pattern on a model that has none of the ten classes is run as it always was', async () => {
    const result = await runText(idsText(spec('p', '<entity><name><xs:restriction base="xs:string"><xs:pattern value="IFCDOORSTANDARDCASE"/></xs:restriction></name></entity>')), ifcText(body(['IFCDOOR', 'IFCWALL']), 'IFC4'));
    expect(result.specs[0].withheld).toBeUndefined();
    expect(result.specs[0].state).not.toBe('unchecked');
    expect(result.specs[0].applicable).toBe(0);
  });

  it('IFC2X3: a name the occurrence/type mapping answers for is withheld when the model declares the control element, and not otherwise', async () => {
    const sensor = spec('s', entity(['IFCSENSOR']), never, 'IFC2X3');
    const has = await runText(idsText(sensor), ifcText(body(['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCWALL']), 'IFC2X3'));
    expect(has.specs[0].state).toBe('unchecked');
    expect(has.specs[0].withheld).toBe(withheldSentence(['IFCDISTRIBUTIONCONTROLELEMENT']));
    const hasNot = await runText(idsText(sensor), ifcText(body(['IFCDISTRIBUTIONELEMENT', 'IFCWALL']), 'IFC2X3'));
    expect(hasNot.specs[0].withheld).toBeUndefined();
    expect(hasNot.specs[0].state).not.toBe('unchecked');
  });

  it('the sentence names every class concerned, and the parent', () => {
    expect(withheldSentence(['IFCDOORSTANDARDCASE', 'IFCWINDOWSTANDARDCASE'])).toBe('This model has IfcDoorStandardCase and IfcWindowStandardCase elements, and the engine in this version cannot tell those classes from their parent classes IfcDoor and IfcWindow, so the result for this specification is withheld until a fixed engine version, which is on its way.');
    expect(withheldSentence(['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCDISTRIBUTIONFLOWELEMENT'])).toContain('from their parent class IfcDistributionElement');
    expect(Object.keys(CLASS_NAME).length).toBe(19);
  });
});

describe('what the guard looks at (foldEffect)', () => {
  const doc = (xml: string) => readIds(idsText(xml)).specifications[0];
  const pattern = (p: string) => `<entity><name><xs:restriction base="xs:string"><xs:pattern value="${p}"/></xs:restriction></name></entity>`;
  for (const sub of TEN) {
    const par = FOLDED_ONTO[sub];
    it(`${sub}: subtype alone and parent alone change, both and neither do not`, () => {
      expect(foldEffect(doc(spec('s', entity([sub]))), [sub], false)).toEqual({ classes: [sub], correctable: true });
      expect(foldEffect(doc(spec('s', entity([par]))), [sub], false)).toEqual({ classes: [sub], correctable: true });
      expect(foldEffect(doc(spec('s', entity([sub, par]))), [sub], false)).toBeNull();
      expect(foldEffect(doc(spec('s', entity(['IFCWALL']))), [sub], false)).toBeNull();
      // the model does not declare it
      expect(foldEffect(doc(spec('s', entity([sub]))), [], false)).toBeNull();
      expect(foldEffect(doc(spec('s', entity([par]))), TEN.filter((c) => c !== sub && FOLDED_ONTO[c] !== par), false)).toBeNull();
      expect(foldEffect(doc(spec('s', pattern(sub))), [sub], false)).toEqual({ classes: [sub], correctable: false });
      expect(foldEffect(doc(spec('s', entity([sub]), `<requirements>${entity([sub])}</requirements>`)), [sub], false)?.correctable).toBe(false);
      expect(foldEffect(doc(spec('s', entity([sub], '<predefinedType><simpleValue>X</simpleValue></predefinedType>'))), [sub], false)?.correctable).toBe(false);
    });
  }
  it('a pattern that could take long is not evaluated: it counts as concerned', () => {
    expect(foldEffect(doc(spec('s', pattern('(IFC|X)+DOOR'))), ['IFCDOORSTANDARDCASE'], false)).toEqual({ classes: ['IFCDOORSTANDARDCASE'], correctable: false });
  });
  it('the namespace of the test helper is the standard\'s', () => { expect(NS).toBe('http://standards.buildingsmart.org/IDS'); });
});

describe('the class is read from the STEP line, and the parser\'s own exact-class answer agrees with it', () => {
  for (const { v, file } of VERSIONS) {
    it(`${v}: for every concrete class of the tables, the entity index and the entity table both give the class the line declares`, async () => {
      const s = await loadSchema(v);
      const concrete = [...s.classes.entries()].filter(([, c]) => c.kind === 'concrete').map(([u]) => u);
      const u = new TextEncoder().encode(ifcText(body(concrete), file));
      const store = await new IfcParser().parseColumnar(u.buffer as ArrayBuffer, {});
      const entities = store.entities as unknown as { getExactTypeName?: (id: number) => string };
      expect(typeof entities.getExactTypeName).toBe('function');
      expect(concrete.filter((c, i) => store.entityIndex.byId.get(i + 1)?.type !== c)).toEqual([]);
      // The entity table summarises the products (it names a resource-level class "Unknown"): of those it agrees.
      const products = concrete.filter((c) => s.isA(c, 'IFCPRODUCT'));
      expect(products.length).toBeGreaterThan(50);
      expect(products.filter((c) => entities.getExactTypeName!(concrete.indexOf(c) + 1).toUpperCase() !== c)).toEqual([]);
    });
  }
});

describe('the requirements of a corrected specification are checked on the elements it now applies to', () => {
  const two = (cls: string, v = 'IFC4') => ifcText(line(1, cls, 'A') + line(2, cls, 'B') + line(3, 'IFCWALL', 'A'), v);
  const nameA = nameIsA();
  function nameIsA() { return '<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>A</simpleValue></value></attribute></requirements>'; }
  for (const sub of TEN) {
    const v = sub.endsWith('STANDARDCASE') ? 'IFC4' : 'IFC2X3';
    const par = FOLDED_ONTO[sub];
    it(`${sub} (${v}): applies to the two elements of the class, one meets the requirement, in every cardinality`, async () => {
      const model = two(sub, v);
      const required = await runText(idsText(spec('r', entity([sub]), nameA, v)), model);
      expect(required.specs[0]).toMatchObject({ state: 'fail', applicable: 2, passed: 1, failed: 1 });
      expect(required.specs[0].failures.map((f) => f.name)).toEqual(['B']);
      expect(required.specs[0].failures[0].ifcClass).toBe(CLASS_NAME[sub]);
      const optional = await runText(idsText(spec('o', entity([sub]), nameA, v, 'minOccurs="0" maxOccurs="unbounded"')), model);
      expect(optional.specs[0]).toMatchObject({ state: 'fail', applicable: 2, passed: 1, failed: 1 });
      const prohibited = await runText(idsText(spec('p', entity([sub]), '', v, 'minOccurs="0" maxOccurs="0"')), model);
      expect(prohibited.specs[0]).toMatchObject({ state: 'fail', applicable: 2, failed: 2 });
      // The parent alone does not reach the subtype.
      const parent = await runText(idsText(spec('q', entity([par]), nameA, v)), model);
      expect(parent.specs[0].applicable).toBe(0);
      expect(parent.specs[0].withheld).toBeUndefined();
    });
  }

  it('a model cut into many ranges gives the same answer', async () => {
    const model = ifcText(Array.from({ length: 40 }, (_, i) => line(i + 1, i % 2 ? 'IFCDOORSTANDARDCASE' : 'IFCDOOR', `n${i}`)).join(''), 'IFC4');
    const xml = idsText(spec('sub', entity(['IFCDOORSTANDARDCASE'])), spec('par', entity(['IFCDOOR'])), spec('both', entity(['IFCDOOR', 'IFCDOORSTANDARDCASE'])));
    const whole = await runText(xml, model);
    const cut = await runText(xml, model, { rangeIds: 7 });
    expect(whole.specs.map((r) => r.applicable)).toEqual([20, 20, 40]);
    expect(cut.specs.map((r) => r.applicable)).toEqual([20, 20, 40]);
    expect(cut.specs.map((r) => r.failed)).toEqual(whole.specs.map((r) => r.failed));
  });

  it('a pattern the guard cannot work out is withheld, not guessed at', async () => {
    const risky = spec('p', '<entity><name><xs:restriction base="xs:string"><xs:pattern value="(IFC|X)+DOOR"/></xs:restriction></name></entity>');
    const result = await runText(idsText(risky), ifcText(body(['IFCDOORSTANDARDCASE', 'IFCWALL']), 'IFC4'));
    expect(result.specs[0].state).toBe('unchecked');
    expect(result.specs[0].withheld).toBe(withheldSentence(['IFCDOORSTANDARDCASE']));
  });

  it('a specification that names both the subtype and the parent, or neither, is run as it always was, with or without the class in the model', async () => {
    const xml = idsText(spec('both', entity(['IFCDOOR', 'IFCDOORSTANDARDCASE'])), spec('other', entity(['IFCWALL'])));
    for (const model of [ifcText(body(['IFCDOORSTANDARDCASE', 'IFCDOOR', 'IFCWALL']), 'IFC4'), ifcText(body(['IFCDOOR', 'IFCWALL']), 'IFC4')]) {
      const r = await runText(xml, model);
      expect(r.specs.map((x) => x.withheld)).toEqual([undefined, undefined]);
      expect(r.specs.map((x) => x.state)).toEqual(['fail', 'fail']);
    }
  });
});
