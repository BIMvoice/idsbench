import { describe, expect, it } from 'vitest';
import { AppError, mapError } from '../src/core/errors';
import { formatSize, reportFileName } from '../src/core/format';

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
    expect(mapError(new AppError('schema-mismatch', 'x'), 'ifc')).toEqual({ kind: 'schema-mismatch', message: 'x' }));
  it('never leaks stack text or the raw message', () => {
    const e = new Error('TypeError at foo (bar.js:1:2)');
    for (const stage of ['ids', 'ifc', 'validate'] as const) {
      const m = mapError(e, stage).message;
      expect(m).not.toMatch(/\.js|TypeError|at foo/);
    }
  });
  it('non-Error throws are handled', () => expect(mapError('oops', 'ifc').kind).toBe('ifc-unreadable'));
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
