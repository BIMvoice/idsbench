// A specification for IfcWall does not apply to an IfcWallStandardCase (IDS has no inheritance). The result says so
// from the model's own class counts, and never changes a count or the verdict.
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema } from '@idsbench/check/ifc';
import { coverageOf } from '../src/core/coverage';
import { csvHeader, failuresCsvParts, parseCsv } from '../src/core/csv';
import { idsText, ifcText, line, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const standardCase = fs.readFileSync(new URL('./fixtures/ifc2x3-standardcase-walls.ifc', import.meta.url), 'utf8');
const fireRating = '<requirements><property cardinality="required"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property></requirements>';
const csvText = async (parts: BlobPart[]) => (await Promise.all(parts.map((p) => (typeof p === 'string' ? p : (p as Blob).text())))).join('');

describe('what a specification does not cover in this model', () => {
  it('a required specification for IfcWall, a model of IfcWallStandardCase: Fail as before, and the row says what the model has', async () => {
    const r = await runText(idsText(specXml('Walls have a fire rating', 'IFCWALL', undefined, fireRating, 'IFC2X3')), standardCase);
    // the verdict and the counts are the ones the engine gives, unchanged by the hint
    expect(r.verdict).toBe('fail');
    expect(r.specs[0]).toMatchObject({ state: 'fail', applicable: 0, passed: 0, failed: 0 });
    expect(r.specs[0].coverage?.text).toBe('This specification names IfcWall. The model has no IfcWall, but it has 3 IfcWallStandardCase, which this specification does not cover.');
    expect(r.specs[0].coverage?.related).toEqual([{ name: 'IfcWallStandardCase', upper: 'IFCWALLSTANDARDCASE', count: 3, how: 'subtype' }]);
    // and the whole-specification row of the CSV says it too
    expect(r.specs[0].wholeFailure).toContain('The model has no IfcWall, but it has 3 IfcWallStandardCase');
    const rows = parseCsv(await csvText(failuresCsvParts(r)));
    expect(rows[0]).toEqual(parseCsv(csvHeader())[0]);
    const whole = rows.find((x) => x[0] === 'Whole specification');
    expect(whole?.[2]).toMatch(/needs at least one matching element, and the model has none\. This specification names IfcWall\./);
  });

  it('an optional specification: "Nothing to check" keeps its state and gains the sentence', async () => {
    const r = await runText(idsText(specXml('Walls have a fire rating', 'IFCWALL', 'minOccurs="0" maxOccurs="unbounded"', fireRating, 'IFC2X3')), standardCase);
    expect(r.specs[0]).toMatchObject({ state: 'nothing', applicable: 0 });
    expect(r.verdict).toBe('pass');
    expect(r.specs[0].coverage?.text).toMatch(/The model has no IfcWall, but it has 3 IfcWallStandardCase/);
  });

  it('with the subtype listed, the specification covers the walls, the failing ones are named, and there is no hint', async () => {
    const list = specXml('Walls', 'IFCWALL', undefined, fireRating, 'IFC2X3').replace('<simpleValue>IFCWALL</simpleValue>', '<xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCWALLSTANDARDCASE"/></xs:restriction>');
    const r = await runText(idsText(list), standardCase);
    expect(r.specs[0]).toMatchObject({ state: 'fail', applicable: 3, passed: 1, failed: 2 });
    expect(r.specs[0].coverage).toBeUndefined();
    expect(r.specs[0].failures.map((f) => f.name)).toEqual(['SC wall fail 1', 'SC wall fail 2']);
  });

  it('fewer elements than expected: the model has IfcWall and IfcWallStandardCase, the specification names IfcWall', async () => {
    const model = ifcText(line(1, 'IFCWALL', 'plain') + line(2, 'IFCWALLSTANDARDCASE', 'a') + line(3, 'IFCWALLSTANDARDCASE', 'b'), 'IFC4');
    const r = await runText(idsText(specXml('S', 'IFCWALL')), model);
    expect(r.specs[0]).toMatchObject({ state: 'pass', applicable: 1 });
    expect(r.specs[0].coverage?.text).toBe('This specification names IfcWall. The model also has 2 IfcWallStandardCase, which this specification does not cover.');
  });

  it('a supertype is told too: the specification names IfcWallStandardCase, the model has IfcWall', async () => {
    const model = ifcText(line(1, 'IFCWALL', 'plain'), 'IFC4');
    const r = await runText(idsText(specXml('S', 'IFCWALLSTANDARDCASE', 'minOccurs="0" maxOccurs="unbounded"', nameIs('x'))), model);
    expect(r.specs[0].coverage?.text).toMatch(/names IfcWallStandardCase\. The model has no IfcWallStandardCase, but it has 1 IfcWall/);
  });

  it('no hint when the model has nothing related, when the class is in the model, or when another condition may be the reason', async () => {
    const model = ifcText(line(1, 'IFCSLAB', 's'), 'IFC4');
    expect((await runText(idsText(specXml('S', 'IFCWALL')), model)).specs[0].coverage).toBeUndefined();
    const other = '<specification name="S" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>zz</simpleValue></value></attribute></applicability><requirements><attribute cardinality="required"><name><simpleValue>Tag</simpleValue></name></attribute></requirements></specification>';
    const both = ifcText(line(1, 'IFCWALLSTANDARDCASE', 'a'), 'IFC4');
    expect((await runText(idsText(other), both)).specs[0].coverage).toBeUndefined();
  });

  it('the hint never changes a count or a verdict: the same run with and without it agrees on everything else', async () => {
    const r = await runText(idsText(specXml('A', 'IFCWALL', undefined, '', 'IFC2X3'), specXml('B', 'IFCDOOR', 'minOccurs="0" maxOccurs="unbounded"', nameIs('x'), 'IFC2X3')), standardCase);
    const stripped = { ...r, specs: r.specs.map(({ coverage, ...rest }) => rest) };
    expect(stripped.specs.map((s) => [s.state, s.applicable, s.passed, s.failed])).toEqual([['fail', 0, 0, 0], ['nothing', 0, 0, 0]]);
    expect(r.verdict).toBe('fail');
  });
});

describe('coverageOf, on its own', () => {
  it('names at most four classes and counts the rest', async () => {
    const s = await loadSchema('IFC4');
    const counts: Record<string, number> = { IFCFLOWSEGMENT: 0, IFCPIPESEGMENT: 5, IFCDUCTSEGMENT: 4, IFCCABLESEGMENT: 3, IFCCABLECARRIERSEGMENT: 2, IFCFLOWFITTING: 0 };
    const c = coverageOf(['IFCFLOWSEGMENT'], 0, (u) => counts[u] ?? 0, s);
    expect(c?.text).toBe('This specification names IfcFlowSegment. The model has no IfcFlowSegment, but it has 5 IfcPipeSegment, 4 IfcDuctSegment, 3 IfcCableSegment and 2 IfcCableCarrierSegment, which this specification does not cover.');
  });
  it('is silent for an abstract class and for a class it does not know', async () => {
    const s = await loadSchema('IFC4');
    expect(coverageOf(['IFCBUILDINGELEMENT'], 0, () => 9, s)).toBeNull();
    expect(coverageOf(['IFCNOTACLASS'], 0, () => 9, s)).toBeNull();
  });
});
