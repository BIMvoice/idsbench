// A specification that fails as a whole has a row of its own in the CSV, marked in the first column, and is counted apart from the elements.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSV_COLUMNS, parseCsv, ROW_KINDS, afterRun, failureCount, failuresCsvParts, wholeFailureCount } from '../src/core/csv';
import { reportParts } from '../src/core/format';
import { idsText, ifcText, line, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const model = ifcText(line(1, 'IFCWALL', 'Waldo') + line(2, 'IFCWALL', 'Wilma') + line(3, 'IFCWALL', 'Waldo') + line(4, 'IFCDOOR', 'D'));
const specs = [
  specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo')),                // one element fails
  specXml('A window is there', 'IFCWINDOW'),                                                   // required, nothing matches: whole
  specXml('At most two walls', 'IFCWALL', 'minOccurs="1" maxOccurs="2"', nameIs('Waldo')),   // three match: whole (and one element fails)
  specXml('At most two doors', 'IFCDOOR', 'minOccurs="1" maxOccurs="2"'),                    // fine
  specXml('No doors', 'IFCDOOR', 'minOccurs="0" maxOccurs="0"'),                             // prohibited and present: one row for the door
  specXml('Optional windows', 'IFCWINDOW', 'minOccurs="0" maxOccurs="unbounded"'),           // nothing to check: no row
];
const csvRows = async (parts: BlobPart[]) => parseCsv(await new Blob(parts).text());

describe('the CSV of a result with specifications that fail as a whole', () => {
  it('has a first column that separates element rows from whole-specification rows', async () => {
    const r = await runText(idsText(...specs), model);
    const rows = await csvRows(failuresCsvParts(r));
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(CSV_COLUMNS[0]).toBe('Row about');
    const element = rows.slice(1).filter((x) => x[0] === ROW_KINDS.element), whole = rows.slice(1).filter((x) => x[0] === ROW_KINDS.specification);
    expect(element.length + whole.length).toBe(rows.length - 1);
    // Element rows are exactly the failing elements the run counted: one wall named Wilma twice (two specs), and the door that must not be there.
    expect(element.map((x) => [x[1], x[3]])).toEqual([['Walls are named Waldo', 'IfcWall'], ['At most two walls', 'IfcWall'], ['No doors', 'IfcDoor']]);
    expect(element.length).toBe(failureCount(r));
    // Whole-specification rows name the specification and the reason, and no element.
    expect(whole.map((x) => x[1])).toEqual(['A window is there', 'At most two walls']);
    expect(whole.length).toBe(wholeFailureCount(r));
    expect(whole[0][2]).toContain('needs at least one matching element');
    expect(whole[1][2]).toContain('allows at most 2 matching elements, and the model has 3');
    for (const w of whole) expect([w[3], w[4], w[5]]).toEqual(['', '', '']);
  });
  it('is the same for a result made in the worker, which keeps the elements in blobs', async () => {
    const held = await runText(idsText(...specs), model);
    const spilled = await runText(idsText(...specs), model, { spill: true });
    expect(await new Blob(failuresCsvParts(spilled)).text()).toBe(await new Blob(failuresCsvParts(held)).text());
  });
  it('is in the report too, as the reason of the specification and not as an element', async () => {
    const r = await runText(idsText(...specs), model);
    const j = JSON.parse(await new Blob(reportParts(r)).text());
    expect(j.specs.map((s: { wholeFailure?: string }) => !!s.wholeFailure)).toEqual([false, true, true, false, false, false]);
  });
  it('is said in the sentence that tells what to do', async () => {
    const onlyWhole = await runText(idsText(specs[1]), model);
    expect(failureCount(onlyWhole)).toBe(0);
    expect(afterRun(onlyWhole)).toMatch(/No single element failed: a specification failed as a whole.*Download failing elements gives it as a row/);
    expect(afterRun(await runText(idsText(...specs), model))).toMatch(/with a row for each specification that failed as a whole/);
  });
});
