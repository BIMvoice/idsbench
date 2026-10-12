/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A specification made by this page applies to a class and its subtypes in every IFC version it ticks. With several
// versions ticked the list holds the subtypes of each of them (IfcDoorStandardCase is a class of IFC4 alone, and an IFC4
// model is exactly where a list without it would pass over the doors). This feeds every class the form offers, for every
// combination of ticked versions, to the Check engine and to a run against a model of each ticked version that holds one
// element of every class, and compares what the run applied to with the class tables.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema, type IfcVersion, type SchemaData } from '@idsbench/check/ifc';
import { checkIds } from '@idsbench/check';
import { createTranslationService, validateIDS } from '@ifc-lite/ids';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { IfcParser } from '@ifc-lite/parser';
import { IFC2X3_ALIASES } from '../src/core/foldguard';
import { readIds } from '../src/core/validate';
import { listsFor } from '../src/core/picks';
import { familyOf, subtypeNote, withDefaultSubtypes } from '../src/core/subtypes';
import { blankDocument, newFacet, newSpecification, simple, type Facet, type Specification } from '../src/core/ids/model';
import { listOf } from '../src/core/ids/value';
import { writeIds } from '../src/core/ids/write';
import { describeSpecification } from '../src/core/ids/words';
import { idsText, ifcText, line, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const V: IfcVersion[] = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
const COMBOS: IfcVersion[][] = [[V[0]], [V[1]], [V[2]], [V[0], V[1]], [V[1], V[2]], [V[0], V[2]], V];
const tables = async (): Promise<Record<IfcVersion, SchemaData>> => Object.fromEntries(await Promise.all(V.map(async (v) => [v, await loadSchema(v)])));
const made = (cls: string, combo: IfcVersion[], schemas: SchemaData[]): Specification => withDefaultSubtypes({
  ...newSpecification(), name: cls, ifcVersion: combo, applicability: [{ ...newFacet('entity', 'applicability'), name: simple(cls) } as Facet],
  // A requirement no element meets, so that every element the specification applies to is listed with its class.
  requirements: [{ ...newFacet('attribute', 'requirements'), name: simple('Name'), value: simple('never-this') } as Facet],
}, schemas);
const written = (s: Specification): string[] => { const e = s.applicability[0]; return e.kind !== 'entity' ? [] : e.name.kind === 'simple' ? [e.name.value] : listOf(e.name); };

// The run library (@ifc-lite/ids 3.2.0 on @ifc-lite/parser 9.2.0) reports an element of these classes under the class
// beside it. The run of this page does not pass that on (core/foldguard.ts runs a specification that the fold changes with
// the class the file declares, or withholds its result); the last test of this file pins what the library itself does,
// so that this table goes when the library is fixed (tests/engine-version.test.ts says when).
const REPORTED_AS: Record<string, string> = {
  IFCBEAMSTANDARDCASE: 'IFCBEAM', IFCCOLUMNSTANDARDCASE: 'IFCCOLUMN', IFCDOORSTANDARDCASE: 'IFCDOOR', IFCMEMBERSTANDARDCASE: 'IFCMEMBER',
  IFCOPENINGSTANDARDCASE: 'IFCOPENINGELEMENT', IFCPLATESTANDARDCASE: 'IFCPLATE', IFCSLABSTANDARDCASE: 'IFCSLAB', IFCWINDOWSTANDARDCASE: 'IFCWINDOW',
  IFCDISTRIBUTIONCONTROLELEMENT: 'IFCDISTRIBUTIONELEMENT', IFCDISTRIBUTIONFLOWELEMENT: 'IFCDISTRIBUTIONELEMENT',
};

describe('the class and its subtypes, for every class the form offers and every combination of ticked versions', () => {
  for (const combo of COMBOS) {
    it(`${combo.join(' + ')}: the list is accepted by the Check engine, and a run applies it to exactly the elements of the class and its subtypes in a model of each ticked version`, async () => {
      const all = await tables();
      const schemas = combo.map((v) => all[v]);
      const classes = listsFor(schemas).classes.map((c) => c.value);
      const specs = classes.map((c) => made(c, combo, schemas));
      // 1. What is written: the class, and every class that is a concrete subtype of it in some ticked version and is
      //    not a class under something else in another (worked out here from the tables alone).
      classes.forEach((c, i) => {
        const subs = new Set(schemas.flatMap((s) => s.concrete(c).filter((u) => u !== c)));
        const elsewhere = (u: string) => schemas.some((s) => s.classes.get(u)?.kind === 'concrete' && !s.isA(u, c));
        expect([...written(specs[i])].sort(), c).toEqual([c, ...[...subs].filter((u) => !elsewhere(u))].sort());
        // 2. The sentence admits it: a list is said as the class "including" its subtypes, or "and its N subtypes".
        if (written(specs[i]).length > 1) {
          const family = familyOf(specs[i], schemas);
          expect(family?.head, c).toBe(c);
          expect(describeSpecification(specs[i], { family, className: (u) => schemas.map((s) => s.classes.get(u)?.name).find(Boolean) }).text, c).toMatch(/, including | \(and its \d+ subtypes?\)/);
        }
        // 3. What the list leaves out of a ticked version is said in the line beside the specification, by name.
        const leftOut = [...subs].filter(elsewhere);
        const note = subtypeNote(specs[i], schemas);
        expect((note?.partial ?? []).map((p) => p.upper).sort(), c).toEqual(leftOut.sort());
        for (const u of leftOut) expect(note!.text, c).toContain(schemas.map((s) => s.classes.get(u)?.name).find(Boolean)!);
      });
      // 4. The Check engine accepts all of them in one file.
      const xml = writeIds({ ...blankDocument(), info: { ...blankDocument().info, title: 't' }, specifications: specs });
      expect((await checkIds(xml)).findings.filter((f) => f.severity === 'error').map((f) => f.message)).toEqual([]);
      // 5. A model of each ticked version with one element of every class: the specification applies to one element per class it names that the version has.
      for (const v of combo) {
        const inModel = all[v].concrete('IFCOBJECTDEFINITION');
        const result = await runText(xml, ifcText(inModel.map((c, i) => line(i + 1, c, c)).join(''), v));
        result.specs.forEach((row, i) => {
          const names = new Set(written(specs[i]));
          const reached = inModel.filter((u) => names.has(u));
          // An IFC2X3 model with IfcDistributionControlElement in it: a name the occurrence/type mapping answers for
          // (IfcSensor and the like) would need the class the file declares, and its result is withheld (core/foldguard.ts).
          if (v === 'IFC2X3' && inModel.includes('IFCDISTRIBUTIONCONTROLELEMENT') && [...names].some((n) => IFC2X3_ALIASES.IFCDISTRIBUTIONCONTROLELEMENT.includes(n))) {
            expect(row.state, `${classes[i]} in a model of ${v}`).toBe('unchecked');
            expect(row.withheld, `${classes[i]} in a model of ${v}`).toMatch(/IfcDistributionControlElement/);
            return;
          }
          expect(row.withheld, `${classes[i]} in a model of ${v}`).toBeUndefined();
          expect(row.applicable, `${classes[i]} in a model of ${v}`).toBe(reached.length);
          // Every subtype the version has is among them, but for what the line says is left out.
          const expected = all[v].concrete(classes[i]);
          const partial = new Set((subtypeNote(specs[i], schemas)?.partial ?? []).map((p) => p.upper));
          expect(expected.filter((u) => !names.has(u) && !partial.has(u)), `${classes[i]} in a model of ${v}`).toEqual([]);
        });
      }
    }, 240_000);
  }

  it('IFC2X3, IFC4 and IFC4X3_ADD2 ticked (what a new specification ticks): doors, windows, beams, columns, slabs, members and plates include the standard-case classes of IFC4, and walls both of theirs', async () => {
    const all = await tables();
    const schemas = V.map((v) => all[v]);
    const of = (c: string) => written(made(c, V, schemas));
    expect(of('IFCDOOR')).toEqual(['IFCDOOR', 'IFCDOORSTANDARDCASE']);
    expect(of('IFCWINDOW')).toEqual(['IFCWINDOW', 'IFCWINDOWSTANDARDCASE']);
    expect(of('IFCBEAM')).toEqual(['IFCBEAM', 'IFCBEAMSTANDARDCASE']);
    expect(of('IFCCOLUMN')).toEqual(['IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE']);
    expect(of('IFCSLAB')).toEqual(['IFCSLAB', 'IFCSLABELEMENTEDCASE', 'IFCSLABSTANDARDCASE']);
    expect(of('IFCMEMBER')).toEqual(['IFCMEMBER', 'IFCMEMBERSTANDARDCASE']);
    expect(of('IFCPLATE')).toEqual(['IFCPLATE', 'IFCPLATESTANDARDCASE']);
    expect(of('IFCWALL')).toEqual(['IFCWALL', 'IFCWALLELEMENTEDCASE', 'IFCWALLSTANDARDCASE']);
  });

  it('an IFC4 model whose doors are IfcDoorStandardCase is covered by a door specification that ticks all three versions', async () => {
    const all = await tables();
    const spec = made('IFCDOOR', V, V.map((v) => all[v]));
    const xml = writeIds({ ...blankDocument(), info: { ...blankDocument().info, title: 't' }, specifications: [spec] });
    const result = await runText(xml, ifcText(line(1, 'IFCDOORSTANDARDCASE', 'a') + line(2, 'IFCDOORSTANDARDCASE', 'b') + line(3, 'IFCDOOR', 'c'), 'IFC4'));
    expect(result.specs[0].applicable).toBe(3);
    expect(result.specs[0].coverage).toBeUndefined();
  });

  it('a class another ticked version puts under a different class is left out and named: IfcZone is an IfcSystem in IFC4, not in IFC2X3', async () => {
    const all = await tables();
    const both = [all.IFC2X3, all.IFC4];
    const spec = made('IFCSYSTEM', ['IFC2X3', 'IFC4'], both);
    expect(written(spec)).not.toContain('IFCZONE');
    expect(subtypeNote(spec, both)!.text).toContain('IfcZone (a subtype in IFC4 only) is under another class in the other IFC versions this specification ticks, so it is not offered: add it to the list yourself, or tick fewer versions.');
    // With IFC4 alone it is a subtype like the others.
    expect(written(made('IFCSYSTEM', ['IFC4'], [all.IFC4]))).toContain('IFCZONE');
  });

  it('evidence for REPORTED_AS: the run library itself reports every one of the ten as its parent, so a specification for exactly IFCDOORSTANDARDCASE applies to no IfcDoorStandardCase', async () => {
    const lib = async (cls: string, names: string[]) => {
      const u = new TextEncoder().encode(ifcText(line(1, cls, 'a'), 'IFC4'));
      const store = await new IfcParser().parseColumnar(u.buffer as ArrayBuffer, {});
      const accessor = createDataAccessor(store);
      const doc = readIds(idsText(specXml('s', names[0], undefined, nameIs('x'))).replace(`<simpleValue>${names[0]}</simpleValue>`, names.length === 1 ? `<simpleValue>${names[0]}</simpleValue>` : `<xs:restriction base="xs:string">${names.map((n) => `<xs:enumeration value="${n}"/>`).join('')}</xs:restriction>`));
      const report = await validateIDS(doc, accessor, { modelId: 'm', schemaVersion: 'IFC4', entityCount: 1 }, { translator: createTranslationService('en') });
      return { type: accessor.getEntityType(1), applicable: report.specificationResults[0].applicableCount };
    };
    for (const [sub, parent] of Object.entries(REPORTED_AS)) {
      expect((await lib(sub, [sub])).type?.toUpperCase(), sub).toBe(parent);
      expect((await lib(sub, [sub])).applicable, sub).toBe(0);
      expect((await lib(sub, [parent, sub])).applicable, sub).toBe(1);
    }
  });
  it('and the run of this page applies it, as IDS requires, to the class the file declares', async () => {
    const model = ifcText(line(1, 'IFCDOORSTANDARDCASE', 'a'), 'IFC4');
    const alone = await runText(idsText(specXml('s', 'IFCDOORSTANDARDCASE', undefined, nameIs('x'))), model);
    expect(alone.specs[0].applicable).toBe(1);
    expect(alone.specs[0].withheld).toBeUndefined();
  });
});
