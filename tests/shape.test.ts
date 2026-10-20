/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';
import { headline, listed, schemaNote, shapeReport, shapeSpec, verdictOf, type Counts, type ReportLike } from '../src/core/shape';
import { FAILURE_CAP } from '../src/core/types';

type Spec = ReportLike['specificationResults'][number];
const entity = (i: number, passed: boolean, reason?: string) => ({
  entityType: 'IfcWall',
  entityName: `Wall ${i}`,
  globalId: `gid${i}`,
  passed,
  requirementResults: passed ? [{ status: 'pass' }] : [{ status: 'fail', failureReason: reason }, { status: 'pass' }],
});
const failing = (i: number) => entity(i, false);
const required = { name: 'S', minOccurs: 1, maxOccurs: 'unbounded' as const, applicability: { facets: [{}] } };
const optional = { ...required, minOccurs: 0 };
const prohibited = { ...required, minOccurs: 0, maxOccurs: 0 };
const spec = (over: Partial<Spec> = {}): Spec => ({
  specification: required,
  status: 'pass',
  applicableCount: 2,
  passedCount: 2,
  failedCount: 0,
  entityResults: [],
  ...over,
});
const describeFn = () => 'reason';
const meta = { idsFile: 'a.ids', ifcFile: 'b.ifc', schema: 'IFC4', entityCount: 10, seconds: 1 };
const counts = (over: Partial<Counts>): Counts => ({ specifications: 1, passed: 0, failed: 0, notChecked: 0, nothingToCheck: 0, ...over });

describe('shapeSpec: the table of states', () => {
  it('required, elements match, all meet the requirements: pass', () => {
    const r = shapeSpec(spec(), describeFn);
    expect(r).toMatchObject({ state: 'pass', kind: 'required', applicable: 2, passed: 2, failed: 0, note: null });
    expect(r.summary).toBe('Applied to 2 elements: 2 passed, 0 failed.');
  });
  it('required, some elements fail: fail, and applied = passed + failed', () => {
    const r = shapeSpec(spec({ status: 'fail', applicableCount: 3, passedCount: 2, failedCount: 1, entityResults: [entity(1, true), entity(2, true), failing(3)] }), describeFn);
    expect(r).toMatchObject({ state: 'fail', applicable: 3, passed: 2, failed: 1 });
    expect(r.passed + r.failed).toBe(r.applicable);
  });
  it('required, nothing matches: fail with a sentence, not "nothing to check"', () => {
    const r = shapeSpec(spec({ status: 'fail', applicableCount: 0, passedCount: 0, cardinalityResult: { passed: false, message: 'Expected at least 1, found 0' } }), describeFn);
    expect(r.state).toBe('fail');
    expect(r.note).toBe('This specification needs at least one matching element, and the model has none.');
    expect(r.note).not.toMatch(/Expected at least/);
  });
  it('optional, nothing matches: "nothing", with a sentence saying why', () => {
    const r = shapeSpec(spec({ specification: optional, applicableCount: 0, passedCount: 0, cardinalityResult: { passed: true, message: 'Cardinality satisfied' } }), describeFn);
    expect(r.state).toBe('nothing');
    expect(r.note).toMatch(/optional and no element in this model matches/);
  });
  it('prohibited, nothing matches: a plain pass, not "nothing to check"', () => {
    const r = shapeSpec(spec({ specification: prohibited, applicableCount: 0, passedCount: 0 }), describeFn);
    expect(r).toMatchObject({ state: 'pass', kind: 'prohibited', note: null });
    expect(r.summary).toBe('None found in the model, as this specification asks.');
  });
  it('prohibited, elements match: fail, the matches are listed and none is counted as passed', () => {
    // What the library reports: every match "passed" because there are no requirements.
    const r = shapeSpec(
      spec({ specification: prohibited, status: 'fail', applicableCount: 2, passedCount: 2, failedCount: 0, cardinalityResult: { passed: false, message: 'Expected at most 0, found 2' }, entityResults: [entity(1, true), entity(2, true)] }),
      describeFn,
    );
    expect(r).toMatchObject({ state: 'fail', applicable: 2, passed: 0, failed: 2 });
    expect(r.failures.map((f) => f.globalId)).toEqual(['gid1', 'gid2']);
    expect(r.failures[0].reasons).toEqual(['This element must not be in the model.']);
    expect(r.summary).toBe('Found 2 elements that must not be in the model.');
    expect(r.note).not.toMatch(/Expected at most/);
  });
  it('prohibited with requirements: the requirements are ignored, as the standard says', () => {
    const r = shapeSpec(
      spec({ specification: prohibited, status: 'fail', applicableCount: 1, passedCount: 0, failedCount: 1, entityResults: [failing(1)] }),
      describeFn,
    );
    expect(r.failures[0].reasons).toEqual(['This element must not be in the model.']);
  });
  it('a number of matching elements IDS 1.0 does not have: "unchecked", whatever the library reports for it', () => {
    for (const specification of [{ ...optional, maxOccurs: 1 }, { ...optional, minOccurs: 2, maxOccurs: 'unbounded' as const }, { ...prohibited, minOccurs: 1 }]) {
      const r = shapeSpec(
        spec({ specification, status: 'fail', cardinalityResult: { passed: false, message: 'Expected at most 1, found 2' }, entityResults: [entity(1, true), entity(2, true)] }),
        describeFn,
      );
      expect(r.state).toBe('unchecked');
      expect(r.note).toMatch(/^This specification was not checked: it allows a number of matching elements that IDS 1.0 does not have\./);
      expect(r.wholeFailure).toBeUndefined();
    }
  });
  it('a specification the library could not evaluate is "unchecked", and the library wording is not shown', () => {
    const r = shapeSpec(
      spec({ status: 'fail', applicableCount: 0, passedCount: 0, error: 'Specification could not be evaluated: unsafe regex pattern rejected (catastrophic-backtracking shape): "(a+)+$"' }),
      describeFn,
    );
    expect(r.state).toBe('unchecked');
    expect(r.note).not.toMatch(/regex|catastrophic|evaluated/);
  });
  it('a specification with an empty applicability is "unchecked", whatever the library reports for it', () => {
    const r = shapeSpec(spec({ specification: { ...required, applicability: { facets: [] } }, status: 'pass', applicableCount: 99, passedCount: 99 }), describeFn);
    expect(r).toMatchObject({ state: 'unchecked', applicable: 0, passed: 0, failed: 0 });
    expect(r.note).toMatch(/does not say which elements it applies to/);
  });
  it('a status that is neither pass nor fail is "unchecked", never pass', () => {
    expect(shapeSpec(spec({ status: 'not_applicable', applicableCount: 0, passedCount: 0 }), describeFn).state).toBe('unchecked');
    expect(shapeSpec(spec({ status: 'skipped' }), describeFn).state).toBe('unchecked');
  });
  it('a "pass" status above failing elements is shown as fail', () => {
    const r = shapeSpec(spec({ status: 'pass', applicableCount: 2, passedCount: 2, failedCount: 0, entityResults: [entity(1, true), failing(2)] }), describeFn);
    expect(r).toMatchObject({ state: 'fail', passed: 1, failed: 1 });
  });
  it('unnamed specification gets a placeholder', () =>
    expect(shapeSpec(spec({ specification: { ...required, name: '' } }), describeFn).name).toMatch(/unnamed/));
});

describe('reasons', () => {
  it('uses the reason the library gave for the element, which is the only correct one for a prohibited requirement', () => {
    const r = shapeSpec(spec({ status: 'fail', failedCount: 1, entityResults: [entity(1, false, 'Prohibited value found: "X"')] }), () => 'Unknown: no details');
    expect(r.failures[0].reasons).toEqual(['Prohibited value found: "X".']);
  });
  it('falls back to the describe function, and passing elements are skipped', () => {
    const r = shapeSpec(spec({ status: 'fail', failedCount: 1, entityResults: [failing(1), entity(2, true)] }), describeFn);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].reasons).toEqual(['reason.']);
  });
  it('names the library quoted twice are quoted once', () => {
    const r = shapeSpec(spec({ status: 'fail', failedCount: 1, entityResults: [entity(1, false, 'Property set ""Pset_WallCommon"" not found')] }), describeFn);
    expect(r.failures[0].reasons).toEqual(['Property set "Pset_WallCommon" not found.']);
  });
  it('missing name and GlobalId become null', () => {
    const e = { ...failing(1), entityName: undefined, globalId: undefined };
    const r = shapeSpec(spec({ status: 'fail', entityResults: [e] }), describeFn);
    expect(r.failures[0]).toMatchObject({ name: null, globalId: null });
  });
});

describe('failure list: the page lists 200, the result holds all', () => {
  const many = (n: number) =>
    shapeSpec(spec({ status: 'fail', applicableCount: n, passedCount: 0, failedCount: n, entityResults: Array.from({ length: n }, (_, i) => failing(i)) }), describeFn);

  it('the shaped result is not capped', () => expect(many(FAILURE_CAP + 37).failures).toHaveLength(237));
  it('below the cap everything is listed', () => {
    expect(listed(many(FAILURE_CAP - 1).failures)).toMatchObject({ notShown: 0 });
    expect(listed(many(FAILURE_CAP).failures).shown).toHaveLength(FAILURE_CAP);
    expect(listed(many(FAILURE_CAP).failures).notShown).toBe(0);
  });
  it('above the cap the first 200 are listed and the rest counted', () => {
    const l = listed(many(FAILURE_CAP + 37).failures);
    expect(l.shown).toHaveLength(200);
    expect(l.notShown).toBe(37);
    expect(l.shown[0].globalId).toBe('gid0');
  });
});

describe('schema note', () => {
  it('none when the model version is listed', () => {
    expect(schemaNote('IFC4', 'IFC4')).toBeNull();
    expect(schemaNote('IFC2X3 IFC4', 'IFC4')).toBeNull();
    expect(schemaNote('IFC4X3_ADD2', 'IFC4X3')).toBeNull();
    expect(schemaNote('IFC4X3_ADD2', 'IFC4X3_ADD2')).toBeNull();
  });
  it('says so when the model version is not listed, naming both', () => {
    const n = schemaNote('IFC2X3', 'IFC4');
    expect(n).toMatch(/The model is IFC4, but this specification lists IFC2X3/);
    expect(n).toMatch(/checked anyway/);
  });
  it('IFC4 and IFC4X3 are different versions', () => expect(schemaNote('IFC4', 'IFC4X3_ADD2')).not.toBeNull());
  it('a specification with no ifcVersion gets no note: nothing is invented for it', () => expect(schemaNote(undefined, 'IFC2X3')).toBeNull());
  it('the note does not change the state', () => {
    const r = shapeSpec(spec({ specification: { ...required, ifcVersionRaw: 'IFC2X3' } }), describeFn, 'IFC4');
    expect(r.state).toBe('pass');
    expect(r.schemaNote).not.toBeNull();
  });
});

describe('headline and verdict', () => {
  it('words', () => {
    expect(headline(counts({ specifications: 3, passed: 3 }))).toBe('All 3 specifications passed.');
    expect(headline(counts({ passed: 1 }))).toBe('The one specification passed.');
    expect(headline(counts({ specifications: 5, passed: 2, failed: 3 }))).toBe('2 of 5 specifications passed.');
    expect(headline(counts({ failed: 1 }))).toBe('0 of 1 specification passed.');
    expect(headline(counts({ specifications: 0 }))).toMatch(/no specifications/);
  });
  it('never says "all passed" when one could not be checked', () => {
    const c = counts({ specifications: 3, passed: 2, notChecked: 1 });
    expect(headline(c)).toBe('2 of 3 specifications passed. 1 could not be checked.');
    expect(verdictOf(c)).toBe('incomplete');
  });
  it('names failed and unchecked separately when both occur', () => {
    const c = counts({ specifications: 4, passed: 2, failed: 1, notChecked: 1 });
    expect(headline(c)).toBe('2 of 4 specifications passed. 1 failed. 1 could not be checked.');
    expect(verdictOf(c)).toBe('fail');
  });
  it('says how many passed with nothing to check', () => {
    expect(headline(counts({ specifications: 3, passed: 3, nothingToCheck: 1 }))).toBe(
      'All 3 specifications passed. 1 optional specification matched nothing in this model, so there was nothing to check there.',
    );
  });
  it('shapeReport counts states and the counts add up', () => {
    const r = shapeReport(
      {
        specificationResults: [
          spec(),
          spec({ specification: optional, applicableCount: 0, passedCount: 0 }),
          spec({ status: 'fail', failedCount: 1, passedCount: 1, entityResults: [failing(1)] }),
          spec({ status: 'fail', error: 'x' }),
        ],
      },
      describeFn,
      meta,
    );
    expect(r.counts).toEqual({ specifications: 4, passed: 2, failed: 1, notChecked: 1, nothingToCheck: 1 });
    expect(r.counts.passed + r.counts.failed + r.counts.notChecked).toBe(r.counts.specifications);
    expect(r.allPassed).toBe(false);
    expect(r.verdict).toBe('fail');
  });
  it('one unchecked specification among passes is not "all passed"', () => {
    const r = shapeReport({ specificationResults: [spec(), spec({ status: 'fail', error: 'x' })] }, describeFn, meta);
    expect(r.allPassed).toBe(false);
    expect(r.verdict).toBe('incomplete');
    expect(r.headline).not.toMatch(/^All|^The one/);
  });
  it('an empty IDS is never "all passed"', () => {
    expect(shapeReport({ specificationResults: [] }, describeFn, meta).allPassed).toBe(false);
  });
});
