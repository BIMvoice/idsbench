import { describe, expect, it } from 'vitest';
import { headline, shapeReport, shapeSpec, type ReportLike } from '../src/core/shape';
import { FAILURE_CAP } from '../src/core/types';

type Spec = ReportLike['specificationResults'][number];
const failing = (i: number) => ({
  entityType: 'IfcWall',
  entityName: `Wall ${i}`,
  globalId: `gid${i}`,
  passed: false,
  requirementResults: [{ status: 'fail' as const }, { status: 'pass' as const }],
});
const spec = (over: Partial<Spec> = {}): Spec => ({
  specification: { name: 'S' },
  status: 'pass',
  applicableCount: 2,
  passedCount: 2,
  failedCount: 0,
  entityResults: [],
  ...over,
});
const describeFn = () => 'reason';
const meta = { idsFile: 'a.ids', ifcFile: 'b.ifc', schema: 'IFC4', entityCount: 10, seconds: 1 };

describe('shapeSpec states', () => {
  it('pass with elements', () => expect(shapeSpec(spec(), describeFn).state).toBe('pass'));
  it('pass with no elements is "nothing"', () =>
    expect(shapeSpec(spec({ applicableCount: 0, passedCount: 0 }), describeFn).state).toBe('nothing'));
  it('a required spec with no elements fails, not "nothing"', () => {
    const r = shapeSpec(
      spec({ status: 'fail', applicableCount: 0, passedCount: 0, cardinalityResult: { passed: false, message: 'Expected at least 1' } }),
      describeFn,
    );
    expect(r.state).toBe('fail');
    expect(r.note).toBe('Expected at least 1');
  });
  it('unnamed specification gets a placeholder', () =>
    expect(shapeSpec(spec({ specification: { name: '' } }), describeFn).name).toMatch(/unnamed/));
});

describe('failure list cap', () => {
  const many = (n: number) =>
    spec({ status: 'fail', applicableCount: n, passedCount: 0, failedCount: n, entityResults: Array.from({ length: n }, (_, i) => failing(i)) });

  it('keeps all failures below the cap', () => {
    const r = shapeSpec(many(FAILURE_CAP - 1), describeFn);
    expect(r.failures).toHaveLength(FAILURE_CAP - 1);
    expect(r.failuresNotShown).toBe(0);
  });
  it('keeps exactly the cap at the cap', () => {
    const r = shapeSpec(many(FAILURE_CAP), describeFn);
    expect(r.failures).toHaveLength(FAILURE_CAP);
    expect(r.failuresNotShown).toBe(0);
  });
  it('caps at 200 and counts the rest', () => {
    const r = shapeSpec(many(FAILURE_CAP + 37), describeFn);
    expect(r.failures).toHaveLength(200);
    expect(r.failuresNotShown).toBe(37);
    expect(r.failures[0].globalId).toBe('gid0');
  });
  it('only failing requirements contribute reasons, and passing entities are skipped', () => {
    const r = shapeSpec(spec({ status: 'fail', failedCount: 1, entityResults: [failing(1), { ...failing(2), passed: true }] }), describeFn);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].reasons).toEqual(['reason']);
  });
  it('missing name and GlobalId become null', () => {
    const e = { ...failing(1), entityName: undefined, globalId: undefined };
    const r = shapeSpec(spec({ status: 'fail', entityResults: [e] }), describeFn);
    expect(r.failures[0]).toMatchObject({ name: null, globalId: null });
  });
});

describe('headline and totals', () => {
  it('words', () => {
    expect(headline(3, 3, 0)).toBe('All 3 specifications passed.');
    expect(headline(1, 1, 0)).toBe('The one specification passed.');
    expect(headline(2, 5, 0)).toBe('2 of 5 specifications passed.');
    expect(headline(0, 1, 0)).toBe('0 of 1 specification passed.');
    expect(headline(2, 3, 1)).toBe('2 of 3 specifications passed. 1 applied to nothing in this model.');
    expect(headline(0, 0, 0)).toMatch(/no specifications/);
  });
  it('shapeReport counts states', () => {
    const r = shapeReport(
      { specificationResults: [spec(), spec({ applicableCount: 0, passedCount: 0 }), spec({ status: 'fail', failedCount: 1 })] },
      describeFn,
      meta,
    );
    expect(r.counts).toEqual({ specifications: 3, passed: 2, failed: 1, appliedToNothing: 1 });
    expect(r.allPassed).toBe(false);
    expect(r.headline).toBe('2 of 3 specifications passed. 1 applied to nothing in this model.');
  });
  it('an empty IDS is never "all passed"', () => {
    expect(shapeReport({ specificationResults: [] }, describeFn, meta).allPassed).toBe(false);
  });
});
