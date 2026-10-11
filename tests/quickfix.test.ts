import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkIds, type Finding } from '@idsbench/check';
import { simple, type Facet, type IdsDocument } from '../src/core/ids/model';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { outline, targetOf } from '../src/core/place';
import { candidateFixes, verifyFixes, type Fix } from '../src/core/quickfix';
import { nodeEnv } from './helpers/dom';
import { doc, entity, property, spec } from './helpers/ids';

const here = dirname(fileURLToPath(import.meta.url));
const cases = join(here, '..', 'packages', 'check', 'test', 'fixtures', 'corpus', 'ids-repo', 'TestCases');
const engine = async (d: IdsDocument) => (await checkIds(writeIds(d))).findings;

/** Every confirmed fix for a document, as the page offers them. */
async function offered(d: IdsDocument, lookup = () => null as string | null): Promise<{ finding: Finding; fixes: Fix[] }[]> {
  const xml = writeIds(d);
  const findings = (await checkIds(xml)).findings;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const out = [];
  for (const f of findings) {
    const fixes = await verifyFixes(f, candidateFixes(f, d, targetOf(f, d, outline(xml)), lookup), d, errors, engine);
    out.push({ finding: f, fixes });
  }
  return out;
}

describe('one-press fixes', () => {
  it('a class written in other letters: change it to the name the engine suggests, and the file is valid', async () => {
    const d = doc(spec({ applicability: [entity('IfcWall')] }));
    const [o] = await offered(d);
    expect(o.finding.code).toBe('entity-unknown-class');
    expect(o.fixes.map((f) => f.label)).toEqual(['Change it to IFCWALL']);
    const fixed = o.fixes[0].apply(d);
    expect(await engine(fixed)).toEqual([]);
    expect(d.specifications[0].applicability[0]).toMatchObject({ name: simple('IfcWall') }); // the original is untouched: Undo has something to go back to
  });
  it('a misspelt name with no suggestion gets no button', async () => {
    const [o] = await offered(doc(spec({ applicability: [entity('IFCRABBIT')] })));
    expect(o.finding.code).toBe('entity-unknown-class');
    expect(o.fixes).toEqual([]);
  });
  it('a prohibited specification that still has requirements: remove them (official invalid file)', async () => {
    const xml = readFileSync(join(cases, 'ids', 'invalid-prohibited_specifications_invalid_if_requirements_are_specified.ids'), 'utf8');
    const d = readIdsText(xml, nodeEnv);
    const found = await offered(d);
    const o = found.find((x) => x.finding.code === 'requirements-not-allowed')!;
    expect(o.fixes.map((f) => f.label)).toEqual(['Remove the "Must have" items']);
    expect((await checkIds(writeIds(o.fixes[0].apply(d)))).valid).toBe(true);
  });
  it('a value without a data type, in a standard property set: add the type the standard gives', async () => {
    const d = doc(spec({ requirements: [property('Pset_WallCommon', 'FireRating', { value: simple('60') } as Partial<Facet>)] }));
    const without = await offered(d);
    expect(without.find((x) => x.finding.code === 'value-needs-datatype')!.fixes).toEqual([]); // the tables are not there: nothing is guessed
    const withTables = await offered(d, () => 'IFCLABEL');
    const o = withTables.find((x) => x.finding.code === 'value-needs-datatype')!;
    expect(o.fixes.map((f) => f.label)).toEqual(['Add the data type IFCLABEL']);
    expect(await engine(o.fixes[0].apply(d))).toEqual([]);
  });
  it('no IFC version: one button per version, each accepted', async () => {
    const d = doc(spec({ ifcVersion: [] }));
    const all = (await offered(d)).flatMap((x) => x.fixes);
    expect([...new Set(all.map((f) => f.label))]).toEqual(['Use IFC2X3', 'Use IFC4', 'Use IFC4X3_ADD2']);
    for (const f of all) expect((await checkIds(writeIds(f.apply(d)))).valid).toBe(true);
  });
  it('a fix the engine does not accept is not offered', async () => {
    const d = doc(spec({ applicability: [entity('IfcWall')] }));
    const finding = (await engine(d))[0];
    const bad: Fix = { label: 'no change', apply: (x) => x };
    const worse: Fix = { label: 'another wrong name', apply: (x) => ({ ...x, specifications: [spec({ applicability: [entity('IfcDoor')] })] }) };
    expect(await verifyFixes(finding, [bad, worse], d, 1, engine)).toEqual([]);
  });
  it('a finding about the file as a whole has no fix', () => {
    expect(candidateFixes({ code: 'xml-not-well-formed', message: 'x' }, doc(spec()), { kind: 'file' })).toEqual([]);
  });
});

describe('"Fix" lands on the field', () => {
  const key = async (d: IdsDocument, code: string) => {
    const xml = writeIds(d);
    const f = (await checkIds(xml)).findings.find((x) => x.code === code)!;
    return targetOf(f, d, outline(xml));
  };
  it('an unknown class: the IFC class field of that item', async () => {
    const d = doc(spec(), spec({ applicability: [entity('IFCRABBIT')] }));
    expect(await key(d, 'entity-unknown-class')).toEqual({ kind: 'field', spec: 1, key: `${d.specifications[1].applicability[0].uid}.name` });
  });
  it('a property that the standard set does not have: the property field of the second property', async () => {
    const d = doc(spec({ requirements: [property('Pset_WallCommon', 'FireRating', { dataType: 'IFCLABEL' } as Partial<Facet>), property('Pset_WallCommon', 'Nope', { dataType: 'IFCLABEL' } as Partial<Facet>)] }));
    expect(await key(d, 'property-unknown-in-standard-set')).toEqual({ kind: 'field', spec: 0, key: `${d.specifications[0].requirements[1].uid}.baseName` });
  });
  it('a missing data type: the data type field', async () => {
    const d = doc(spec({ requirements: [property('My_Set', 'Thing', { value: simple('x') } as Partial<Facet>)] }));
    expect(await key(d, 'value-needs-datatype')).toEqual({ kind: 'field', spec: 0, key: `${d.specifications[0].requirements[0].uid}.dataType` });
  });
  it('no IFC version: the versions of that specification', async () => {
    const d = doc(spec({ ifcVersion: [] }));
    const xml = writeIds(d);
    const targets = (await checkIds(xml)).findings.map((f) => targetOf(f, d, outline(xml)));
    expect(targets).toContainEqual({ kind: 'field', spec: 0, key: `${d.specifications[0].uid}.ifcVersion` });
  });
  it('a bad author: that field of About this IDS', async () => {
    const d = doc(spec());
    d.info.author = 'nobody';
    const xml = writeIds(d);
    const f = (await checkIds(xml)).findings[0];
    expect(targetOf(f, d, outline(xml))).toEqual({ kind: 'info', key: 'info.author' });
  });
});
