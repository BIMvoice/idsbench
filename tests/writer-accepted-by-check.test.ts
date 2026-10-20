/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// What Write emits must be a file Check accepts. Three parts:
//   1. a varied set of documents (every facet kind, every cardinality, every way of matching a value, every
//      occurrence) that Write allows to be downloaded: Check must report no error;
//   2. every IDS 1.0 file of the official corpus that Check accepts, read into the editor and written back;
//   3. rule by rule: each condition the Check engine reports as an error is either stopped by the form
//      (checkDocument has an error, so Download is off) or is one of the few that need the IFC tables, which the
//      engine gate on Download / "Use this IDS in Run" stops. The table is the list asked for in the report.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { checkDocument } from '../src/core/ids/check';
import { newFacet, simple, type Facet, type IdsDocument } from '../src/core/ids/model';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { nodeEnv } from './helpers/dom';
import { doc, entity, fromLength, fromPattern, fromRange, list, property, spec } from './helpers/ids';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', 'packages', 'check', 'test', 'fixtures', 'corpus');
const reference = JSON.parse(readFileSync(join(here, '..', 'packages', 'check', 'test', 'fixtures', 'reference', 'reference.json'), 'utf8')).results as { file: string; verdict: string }[];

const make = (kind: Facet['kind'], where: 'applicability' | 'requirements', o: object): Facet => ({ ...newFacet(kind, where), ...o } as Facet);
const attribute = (name: string, o: object = {}) => make('attribute', 'requirements', { name: simple(name), ...o });
const classification = (system: string, o: object = {}) => make('classification', 'requirements', { system: simple(system), ...o });
const material = (o: object = {}) => make('material', 'requirements', o);
const partOf = (cls: string, relation: string | null, o: object = {}) => make('partOf', 'requirements', { entity: { name: simple(cls), predefinedType: null }, relation, ...o });
const occurs = (min: string, max: string) => ({ minOccurs: min, maxOccurs: max });
const errorsOf = async (d: IdsDocument) => (await checkIds(writeIds(d))).findings.filter((f) => f.severity === 'error');

/** Documents Write lets the user download. Each is a different shape of what the form can produce. */
const SAMPLES: Record<string, IdsDocument> = {
  'minimal: one entity': doc(spec()),
  'every optional info field': (() => { const d = doc(spec()); Object.assign(d.info, { copyright: 'c', version: '1.0', description: 'd & <e>', author: 'a@b.co', date: '2026-03-31', purpose: 'p', milestone: 'm' }); return d; })(),
  'three IFC versions': doc(spec({ ifcVersion: ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'] })),
  'IFC2X3 only': doc(spec({ ifcVersion: ['IFC2X3'] })),
  'specification metadata': doc(spec({ identifier: 'SP01', description: 'why', instructions: 'how' })),
  'two specifications': doc(spec({ name: 'A' }), spec({ name: 'B', applicability: [entity('IFCDOOR')] })),
  'entity with predefined type': doc(spec({ applicability: [{ ...entity('IFCWALL'), predefinedType: simple('SHEAR') } as Facet] })),
  'entity as a list': doc(spec({ applicability: [make('entity', 'applicability', { name: list('IFCWALL', 'IFCSLAB') })] })),
  'entity as a pattern': doc(spec({ applicability: [make('entity', 'applicability', { name: fromPattern('IFCWALL.*', 'xs:string') })] })),
  'required property, set and name only': doc(spec({ requirements: [property('Pset_WallCommon', 'FireRating')] })),
  'required property with data type': doc(spec({ requirements: [property('Pset_WallCommon', 'FireRating', { dataType: 'IFCLABEL' })] })),
  'property with value and data type': doc(spec({ requirements: [property('Pset_WallCommon', 'FireRating', { dataType: 'IFCLABEL', value: simple('2HR') })] })),
  'property value as a list': doc(spec({ requirements: [property('Pset_WallCommon', 'FireRating', { dataType: 'IFCLABEL', value: list('30', '60') })] })),
  'property value as a pattern': doc(spec({ requirements: [property('Custom', 'Code', { dataType: 'IFCTEXT', value: fromPattern('[A-Z]{2}[0-9]+', 'xs:string') })] })),
  'property number range': doc(spec({ requirements: [property('Custom', 'Height', { dataType: 'IFCLENGTHMEASURE', value: fromRange({ lower: { value: '2.5', exclusive: false }, upper: { value: '4', exclusive: true } }, 'xs:double') })] })),
  'property text length': doc(spec({ requirements: [property('Custom', 'Code', { dataType: 'IFCLABEL', value: fromLength({ exactly: '', atLeast: '2', atMost: '8' }, 'xs:string') })] })),
  'custom property, optional with data type': doc(spec({ requirements: [property('Custom', 'N', { cardinality: 'optional', dataType: 'IFCBOOLEAN' })] })),
  'custom property, prohibited': doc(spec({ requirements: [property('Custom', 'N', { cardinality: 'prohibited' })] })),
  'attribute with value': doc(spec({ requirements: [attribute('Name', { value: simple('Wilma') })] })),
  'attribute, optional with value': doc(spec({ requirements: [attribute('Description', { cardinality: 'optional', value: simple('x') })] })),
  'attribute, prohibited': doc(spec({ requirements: [attribute('Description', { cardinality: 'prohibited' })] })),
  'classification with value': doc(spec({ requirements: [classification('Uniclass 2015', { value: simple('EF_25_10') })] })),
  'classification, system only, with uri': doc(spec({ requirements: [classification('Uniclass 2015', { uri: 'https://example.com/c' })] })),
  'material, required': doc(spec({ requirements: [material()] })),
  'material with value, optional': doc(spec({ requirements: [material({ cardinality: 'optional', value: simple('Concrete') })] })),
  'partOf required': doc(spec({ requirements: [partOf('IFCBUILDINGSTOREY', 'IFCRELCONTAINEDINSPATIALSTRUCTURE')] })),
  'partOf prohibited': doc(spec({ applicability: [entity('IFCWALL')], requirements: [partOf('IFCBUILDINGSTOREY', null, { cardinality: 'prohibited' })] })),
  'applicability of several kinds, in any order': doc(spec({ applicability: [make('material', 'applicability', {}), entity('IFCWALL'), make('property', 'applicability', { propertySet: simple('Custom'), baseName: simple('N') })] })),
  'optional specification with requirements': doc(spec({ ...occurs('0', 'unbounded'), requirements: [attribute('Name', { value: simple('x') })] })),
  'prohibited specification, no requirements': doc(spec({ ...occurs('0', '0') })),
  'empty requirements element with a description': doc(spec({ requirementsDescription: 'nothing more is required' })),
  'text that needs escaping': doc(spec({ name: 'a "b" & <c>', description: 'line\nbreak\ttab', requirements: [attribute('Name', { value: simple('<&>"\'') })] })),
};

describe('part 1: what Write lets the user download is accepted by Check', () => {
  for (const [name, d] of Object.entries(SAMPLES)) {
    it(name, async () => {
      expect(checkDocument(d).filter((i) => i.level === 'error'), 'the form must allow this document').toEqual([]);
      const res = await checkIds(writeIds(d));
      expect(res.findings.filter((f) => f.severity === 'error').map((f) => `${f.code}: ${f.message}`)).toEqual([]);
      expect(res.valid).toBe(true);
      expect(res.idsVersion).toBe('1.0');
    });
  }
  it('counts', () => { expect(Object.keys(SAMPLES).length).toBeGreaterThanOrEqual(30); });
});

describe('part 2: the official IDS 1.0 files that Check accepts, read and written back', () => {
  const files = reference.filter((r) => r.verdict === 'valid' && r.file.endsWith('.ids'));
  it('every one is accepted again, and the form does not block it', async () => {
    let accepted = 0, blockedByForm: string[] = [], rejected: string[] = [], skipped = 0;
    for (const r of files) {
      const text = readFileSync(join(corpus, r.file), 'utf8');
      let model: IdsDocument;
      try { model = readIdsText(text, nodeEnv); } catch { skipped++; continue; } // not IDS 1.0: Write refuses to open it
      const res = await checkIds(writeIds(model));
      if (!res.valid) rejected.push(`${r.file}: ${res.findings.filter((f) => f.severity === 'error').map((f) => f.code).join(',')}`);
      else accepted++;
      if (checkDocument(model).some((i) => i.level === 'error')) blockedByForm.push(`${r.file}: ${checkDocument(model).filter((i) => i.level === 'error').map((i) => i.message)[0]}`);
    }
    console.log(`PART 2: official files Check accepts: ${files.length}; not IDS 1.0 (Write refuses to open): ${skipped}; written back and accepted: ${accepted}; rejected: ${rejected.length}; blocked by the form although Check accepts them: ${blockedByForm.length}`);
    expect(rejected).toEqual([]);
    // Three of these files have an empty title, which the form used to block; it now suggests a title, so nothing blocks.
    expect(blockedByForm).toEqual([]);
    expect(accepted + skipped).toBe(files.length);
    expect({ checkAccepts: files.length, notIds10: skipped, writtenBackAndAccepted: accepted }).toEqual({ checkAccepts: 346, notIds10: 1, writtenBackAndAccepted: 345 });
  }, 600000);
});

/**
 * The rule-by-rule table. `code` is what Check reports; `stop` says who stops the user:
 *   'form'   Write's guard rails mark the document as having an error, so Download and "Use this IDS in Run" are off;
 *   'engine' it needs the IFC tables; the engine gate refuses at Download and "Use this IDS in Run".
 */
interface Rule { name: string; code: string; stop: 'form' | 'engine'; doc: IdsDocument }
const RULES: Rule[] = [
  { name: 'no IFC version', code: 'ifc-version-invalid', stop: 'form', doc: doc(spec({ ifcVersion: [] })) },
  { name: 'an IFC version IDS 1.0 does not list', code: 'ifc-version-invalid', stop: 'form', doc: doc(spec({ ifcVersion: ['IFC9'] })) },
  { name: 'no applicability', code: 'applicability-empty', stop: 'form', doc: doc(spec({ applicability: [] })) },
  { name: 'prohibited specification that still has requirements', code: 'requirements-not-allowed', stop: 'form', doc: doc(spec({ ...occurs('0', '0'), requirements: [attribute('Name', { value: simple('x') })] })) },
  { name: 'optional specification with no requirements', code: 'requirements-needed', stop: 'form', doc: doc(spec({ ...occurs('0', 'unbounded') })) },
  { name: 'number of matching elements IDS 1.0 does not allow', code: 'cardinality-invalid', stop: 'form', doc: doc(spec({ ...occurs('2', '3'), requirements: [attribute('Name', { value: simple('x') })] })) },
  { name: 'property value without a data type', code: 'value-needs-datatype', stop: 'form', doc: doc(spec({ requirements: [property('Custom', 'N', { value: simple('v') })] })) },
  { name: 'optional property without a data type', code: 'cardinality-needs-value', stop: 'form', doc: doc(spec({ requirements: [property('Custom', 'N', { cardinality: 'optional' })] })) },
  { name: 'optional attribute without a value', code: 'cardinality-needs-value', stop: 'form', doc: doc(spec({ requirements: [attribute('Name', { cardinality: 'optional' })] })) },
  { name: 'optional classification without a value', code: 'cardinality-needs-value', stop: 'form', doc: doc(spec({ requirements: [classification('Uniclass', { cardinality: 'optional' })] })) },
  { name: 'optional material without a value', code: 'cardinality-needs-value', stop: 'form', doc: doc(spec({ requirements: [material({ cardinality: 'optional' })] })) },
  { name: 'prohibited property with a data type', code: 'cardinality-conflicts-datatype', stop: 'form', doc: doc(spec({ requirements: [property('Custom', 'N', { cardinality: 'prohibited', dataType: 'IFCLABEL' })] })) },
  { name: 'IFC class name not in capitals', code: 'entity-unknown-class', stop: 'form', doc: doc(spec({ applicability: [entity('IfcWall')] })) },
  { name: 'class name inside partOf not in capitals', code: 'entity-unknown-class', stop: 'form', doc: doc(spec({ requirements: [partOf('IfcBuildingStorey', null)] })) },
  { name: 'classification system empty', code: 'classification-system-empty', stop: 'form', doc: doc(spec({ requirements: [classification('')] })) },
  { name: 'data type not in capitals', code: 'property-datatype-invalid', stop: 'form', doc: doc(spec({ requirements: [property('Custom', 'N', { dataType: 'ifclabel' })] })) },
  { name: 'pattern that is not a regular expression', code: 'pattern-invalid', stop: 'form', doc: doc(spec({ requirements: [attribute('Name', { value: fromPattern('[a-', 'xs:string') })] })) },
  { name: 'IFC class that does not exist', code: 'entity-unknown-class', stop: 'engine', doc: doc(spec({ applicability: [entity('IFCWALLL')] })) },
  { name: 'attribute that the class does not have', code: 'attribute-unknown', stop: 'engine', doc: doc(spec({ requirements: [attribute('Nope')] })) },
  { name: 'custom property set named Pset_...', code: 'property-reserved-prefix', stop: 'engine', doc: doc(spec({ requirements: [property('Pset_Foo', 'N', { dataType: 'IFCLABEL' })] })) },
  { name: 'data type that is not an IFC data type', code: 'property-datatype-invalid', stop: 'engine', doc: doc(spec({ requirements: [property('Custom', 'N', { dataType: 'IFCNOPE' })] })) },
  { name: 'value that does not fit the data type', code: 'value-invalid-for-type', stop: 'engine', doc: doc(spec({ requirements: [property('Custom', 'N', { dataType: 'IFCINTEGER', value: simple('abc') })] })) },
];

describe('part 3: every condition Check reports as an error is stopped before Download', () => {
  for (const r of RULES) {
    it(`${r.name} [${r.code}, stopped by ${r.stop}]`, async () => {
      const codes = (await errorsOf(r.doc)).map((f) => f.code);
      expect(codes, 'Check must report this condition as an error').toContain(r.code);
      const formErrors = checkDocument(r.doc).filter((i) => i.level === 'error');
      if (r.stop === 'form') expect(formErrors.length, 'the form must block it').toBeGreaterThan(0);
    });
  }
  it('what Check does not report as an error stays advice or is not mentioned', async () => {
    const same: IdsDocument[] = [
      doc(spec({ applicability: [{ ...entity('IFCWALL'), predefinedType: simple('shear') } as Facet] })),
      doc(spec({ requirements: [property('Custom', 'N')] })),
      doc(spec({ requirements: [property('Custom', 'N', { cardinality: 'prohibited' })] })),
    ];
    for (const d of same) {
      expect(await errorsOf(d)).toEqual([]);
      expect(checkDocument(d).filter((i) => i.level === 'error')).toEqual([]);
    }
  });
});
