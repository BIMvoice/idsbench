// The modeller's CSV says what is wrong and what to do: a "What to fix" column built from the requirement and the
// reason, the requirement in words, and the storey or space the model puts the element in.
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSV_COLUMNS, failuresCsvParts, parseCsv } from '../src/core/csv';
import { sentencesFor } from '../src/core/sentences';
import { whatToFix } from '../src/core/reasons';
import { idsText, ifcText, line, runText, specXml } from './helpers/small-model';
import { nodeEnv } from './helpers/dom';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const fixture = (f: string) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const rowsOf = async (parts: BlobPart[]) => parseCsv(await new Blob(parts).text());
const col = (name: (typeof CSV_COLUMNS)[number]) => CSV_COLUMNS.indexOf(name);
const requireProp = (set: string, prop: string) => `<requirements><property cardinality="required"><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${prop}</simpleValue></baseName></property></requirements>`;
const requireAttr = (name: string) => `<requirements><attribute cardinality="required"><name><simpleValue>${name}</simpleValue></name></attribute></requirements>`;
const requireClass = (system: string) => `<requirements><classification cardinality="required"><system><simpleValue>${system}</simpleValue></system></classification></requirements>`;

describe('the columns', () => {
  it('say what was asked, why it failed, what to fix and where the element is', () => {
    expect([...CSV_COLUMNS]).toEqual(['Row about', 'Specification', 'Requirement', 'Why it failed', 'What to fix', 'IFC class', 'Name', 'GlobalId', 'Storey or space', 'Model', 'IDS file']);
  });
});

describe('a property that is not there', () => {
  it('names the property in the reason where the whole property set is missing, and says what to add', async () => {
    const ids = idsText(specXml('Walls have a fire rating', 'IFCWALLSTANDARDCASE', undefined, requireProp('Pset_WallCommon', 'FireRating'), 'IFC2X3'));
    // two of the three walls have no Pset_WallCommon at all, the third has it with a fire rating
    const r = await runText(ids, fixture('ifc2x3-standardcase-walls.ifc'), { sentences: await sentencesFor(ids, nodeEnv) });
    expect(r.specs[0]).toMatchObject({ state: 'fail', applicable: 3, failed: 2 });
    const rows = await rowsOf(failuresCsvParts(r));
    const first = rows[1];
    expect(first[col('Why it failed')]).toMatch(/^The property "FireRating" is missing: the property set "Pset_WallCommon" is not on this element\./);
    expect(first[col('What to fix')]).toBe('Add the property FireRating to Pset_WallCommon');
    expect(first[col('Requirement')]).toBe('Every wall standard case (IfcWallStandardCase) must have the property FireRating in Pset_WallCommon. The model must contain at least one wall standard case (IfcWallStandardCase).');
    expect(first[col('Storey or space')]).toBe('Level 1');
    expect(first[col('Name')]).toBe('SC wall fail 1');
    expect(r.specs[0].failures[0].reasons[0]).not.toMatch(/^Property set "Pset_WallCommon" not found/);
  });
});

describe('an attribute that is there and empty', () => {
  const body = line(1, 'IFCSPACE', '', '$,$,$,$,$,$,$,$') + `#2=IFCSPACE('${String(2).padStart(22, '0')}',$,$,$,$,$,$,$,.ELEMENT.,.INTERNAL.,$);\n`;
  it('reads "Name is empty", not "does not exist", and says "Give this space a name"', async () => {
    const ids = idsText(specXml('Spaces have a name', 'IFCSPACE', 'minOccurs="0" maxOccurs="unbounded"', requireAttr('Name')));
    const r = await runText(ids, ifcText(body), { sentences: await sentencesFor(ids, nodeEnv) });
    expect(r.specs[0].failed).toBe(2);
    for (const f of r.specs[0].failures) expect(f.reasons).toEqual(['Name is empty.']);
    const rows = await rowsOf(failuresCsvParts(r));
    expect(rows[1][col('What to fix')]).toBe('Give this space a name');
    expect(rows[1][col('Why it failed')]).toBe('Name is empty.');
    // both empty-name spaces are one group, as they have one reason
    expect(r.specs[0].groups).toHaveLength(1);
  });
});

describe('a classification that is not there', () => {
  it('says "Classify this door in Uniclass 2015"', async () => {
    const ids = idsText(specXml('Doors are classified', 'IFCDOOR', 'minOccurs="0" maxOccurs="unbounded"', requireClass('Uniclass 2015')));
    const door = `#1=IFCDOOR('${String(1).padStart(22, '0')}',$,'D',$,$,$,$,$,$,$,$,$,$);\n`;
    const r = await runText(ids, ifcText(door));
    const rows = await rowsOf(failuresCsvParts(r));
    expect(rows[1][col('What to fix')]).toBe('Classify this door in Uniclass 2015');
  });
});

describe('an element that must not be there', () => {
  it('says to remove it or change its class', async () => {
    const ids = idsText(specXml('No generic proxies', 'IFCBUILDINGELEMENTPROXY', 'minOccurs="0" maxOccurs="0"'));
    const r = await runText(ids, fixture('small-with-proxy.ifc').replace(/IFCWALL\(/g, 'IFCBUILDINGELEMENTPROXY(').replace(/(IFCBUILDINGELEMENTPROXY\([^\n]*),\$\);/g, '$1,$,$);'), {});
    expect(r.specs[0].failed).toBeGreaterThan(0);
    const rows = await rowsOf(failuresCsvParts(r));
    expect(rows[1][col('What to fix')]).toBe('Remove this element or change its class');
  });
});

describe('whatToFix on its own', () => {
  it('has a sentence for each way a requirement fails, and none that is empty for a kind it knows', () => {
    const q = (type: string, extra: object = {}, facet: object = {}) => ({ status: 'fail', failure: { type, ...extra }, requirement: { facet } });
    expect(whatToFix(q('PROPERTY_EMPTY', { field: 'FireRating', context: { propertySet: 'Pset_WallCommon' } }), 'IfcWall')).toBe('Give Pset_WallCommon.FireRating a value');
    expect(whatToFix(q('PROPERTY_VALUE_MISMATCH', { expected: '"EI60"' }, { propertySet: { type: 'simpleValue', value: 'Pset_WallCommon' }, baseName: { type: 'simpleValue', value: 'FireRating' } }), 'IfcWall')).toBe('Change Pset_WallCommon.FireRating to "EI60"');
    expect(whatToFix(q('MATERIAL_MISSING'), 'IFCSLAB')).toBe('Assign a material to this slab');
    expect(whatToFix(q('PARTOF_RELATION_MISSING', { expected: 'IfcBuildingStorey' }), 'IfcWall')).toBe('Make this wall part of IfcBuildingStorey');
    expect(whatToFix({ status: 'fail', requirement: { optionality: 'prohibited', facet: { type: 'material' } } }, 'IfcWall')).toBe('Remove the material from this wall');
  });
});
