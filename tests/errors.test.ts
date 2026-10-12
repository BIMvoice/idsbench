/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';
import { AppError, FILE_UNREADABLE, OUT_OF_MEMORY, UNEXPECTED, mapError } from '../src/core/errors';
import { formatSize, reportFileName, reportParts } from '../src/core/format';
import { shapeReport } from '../src/core/shape';

describe('mapError', () => {
  it('xml syntax problems in the IDS', () => {
    expect(mapError(new Error('Failed to parse IDS XML missing root element'), 'ids').kind).toBe('ids-not-xml');
  });
  it('other IDS problems', () => {
    expect(mapError(new Error('No specifications element'), 'ids').kind).toBe('ids-rejected');
  });
  it('IFC problems', () => expect(mapError(new Error('boom'), 'ifc').kind).toBe('ifc-unreadable'));
  it('unknown validation problems', () => expect(mapError(new Error('boom'), 'validate').kind).toBe('unexpected'));
  it('AppError passes through unchanged', () =>
    expect(mapError(new AppError('ifc-cut-off', 'x'), 'ifc')).toEqual({ kind: 'ifc-cut-off', message: 'x' }));
  it('running out of memory gets its own sentence, in the model stage and the checking stage', () => {
    expect(mapError(new RangeError('Array buffer allocation failed'), 'ifc').kind).toBe('out-of-memory');
    expect(mapError(new RangeError('Invalid array length'), 'validate').kind).toBe('out-of-memory');
    expect(mapError(new Error('out of memory'), 'validate').message).toBe(OUT_OF_MEMORY);
  });
  it('never leaks stack text or the raw message', () => {
    const e = new Error('TypeError at foo (bar.js:1:2)');
    for (const stage of ['ids', 'ifc', 'validate'] as const) {
      const m = mapError(e, stage).message;
      expect(m).not.toMatch(/\.js|TypeError|at foo/);
    }
  });
  it('non-Error throws are handled', () => expect(mapError('oops', 'ifc').kind).toBe('ifc-unreadable'));
  it('no message sends the reader to the browser console or uses developer words', () => {
    const all = [UNEXPECTED, OUT_OF_MEMORY, FILE_UNREADABLE, ...(['ids', 'ifc', 'validate'] as const).map((s) => mapError(new Error('x'), s).message), mapError(new Error('unclosed'), 'ids').message];
    for (const m of all) expect(m).not.toMatch(/console|XML|parse|undefined|null|exception|accessor|STEP/i);
  });
});

describe('format', () => {
  it('sizes', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(36323573)).toBe('34.6 MB');
  });
  it('report file name', () => {
    expect(reportFileName('House.IFC')).toBe('House-ids-report.json');
    expect(reportFileName('.ifc')).toBe('model-ids-report.json');
  });
});

describe('downloaded report', () => {
  const n = 1234;
  const result = shapeReport(
    {
      specificationResults: [
        {
          specification: { name: 'Walls "need" a rating', minOccurs: 1 },
          status: 'fail', applicableCount: n, passedCount: 0, failedCount: n,
          entityResults: Array.from({ length: n }, (_, i) => ({ entityType: 'IfcWall', entityName: `W${i}`, globalId: `g${i}`, passed: false, requirementResults: [{ status: 'fail', failureReason: 'r' }] })),
        },
        { specification: { name: 'ok', minOccurs: 1 }, status: 'pass', applicableCount: 1, passedCount: 1, failedCount: 0, entityResults: [] },
      ],
    },
    () => 'r',
    { idsFile: 'a.ids', ifcFile: 'b.ifc', schema: 'IFC4', entityCount: n, seconds: 1 },
  );
  it('is one valid JSON document equal to the result', () => {
    // The report is the result without the page's own view of it (`groups`, `notListed`), which would only repeat the elements.
    const expected = JSON.parse(JSON.stringify(result));
    for (const s of expected.specs) { delete s.groups; delete s.notListed; }
    expect(JSON.parse(reportParts(result).join(''))).toEqual(expected);
  });
  it('holds every failing element, not only the 200 the page lists', () => {
    const j = JSON.parse(reportParts(result).join(''));
    expect(j.specs[0].failures).toHaveLength(n);
    expect(j.specs[0].failed).toBe(n);
    expect(j.specs[0].failures[n - 1].globalId).toBe(`g${n - 1}`);
  });
  it('names both files and the verdict', () => {
    const j = JSON.parse(reportParts(result).join(''));
    expect(j).toMatchObject({ idsFile: 'a.ids', ifcFile: 'b.ifc', verdict: 'fail', allPassed: false });
    expect(j).not.toHaveProperty('notice');
  });
});
