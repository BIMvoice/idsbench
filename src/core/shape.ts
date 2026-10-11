import { FAILURE_CAP, type FailingElement, type RunResult, type SpecRow, type SpecState } from './types';

/**
 * The parts of the @ifc-lite/ids report that we read. Declared structurally so
 * the shaping logic can be tested without running a validation.
 */
export interface ReportLike {
  specificationResults: Array<{
    specification: { name: string };
    status: 'pass' | 'fail' | 'not_applicable';
    applicableCount: number;
    passedCount: number;
    failedCount: number;
    error?: string;
    cardinalityResult?: { passed: boolean; message: string };
    entityResults: Array<{
      entityType: string;
      entityName?: string;
      globalId?: string;
      passed: boolean;
      requirementResults: Array<{ status: 'pass' | 'fail' | 'not_applicable' }>;
    }>;
  }>;
}

export type Describe<R> = (req: R) => string;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function headline(passed: number, total: number, nothing: number): string {
  if (total === 0) return 'The IDS file contains no specifications, so there was nothing to check.';
  const base =
    passed === total
      ? total === 1
        ? 'The one specification passed.'
        : `All ${total} specifications passed.`
      : `${passed} of ${plural(total, 'specification')} passed.`;
  if (nothing === 0) return base;
  return `${base} ${nothing === 1 ? '1 applied to nothing in this model.' : `${nothing} applied to nothing in this model.`}`;
}

export function shapeSpec<R extends { status: string }>(
  spec: ReportLike['specificationResults'][number],
  describe: Describe<R>,
  cap = FAILURE_CAP,
): SpecRow {
  const failingEntities = spec.entityResults.filter((e) => !e.passed);
  const failures: FailingElement[] = failingEntities.slice(0, cap).map((e) => ({
    ifcClass: e.entityType,
    name: e.entityName ?? null,
    globalId: e.globalId ?? null,
    reasons: e.requirementResults
      .filter((r) => r.status === 'fail')
      .map((r) => describe(r as unknown as R)),
  }));

  let state: SpecState;
  if (spec.status === 'fail') state = 'fail';
  else if (spec.applicableCount === 0) state = 'nothing';
  else state = 'pass';

  let note: string | null = null;
  if (spec.error) note = spec.error;
  else if (spec.status === 'fail' && spec.cardinalityResult && !spec.cardinalityResult.passed) {
    note = spec.cardinalityResult.message;
  }

  return {
    name: spec.specification.name || '(unnamed specification)',
    state,
    applicable: spec.applicableCount,
    passed: spec.passedCount,
    failed: spec.failedCount,
    note,
    failures,
    // Count from what the report really holds, not from failedCount alone.
    failuresNotShown: Math.max(0, failingEntities.length - failures.length),
  };
}

export function shapeReport<R extends { status: string }>(
  report: ReportLike,
  describe: Describe<R>,
  meta: { idsFile: string; ifcFile: string; schema: string; entityCount: number; seconds: number },
  cap = FAILURE_CAP,
): RunResult {
  const specs = report.specificationResults.map((s) => shapeSpec(s, describe, cap));
  const passed = specs.filter((s) => s.state !== 'fail').length;
  const failed = specs.filter((s) => s.state === 'fail').length;
  const nothing = specs.filter((s) => s.state === 'nothing').length;
  return {
    ...meta,
    specs,
    counts: { specifications: specs.length, passed, failed, appliedToNothing: nothing },
    headline: headline(passed, specs.length, nothing),
    allPassed: failed === 0 && specs.length > 0,
    seconds: meta.seconds,
  };
}
