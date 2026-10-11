import {
  FAILURE_CAP,
  type FailingElement,
  type RunResult,
  type SpecKind,
  type SpecRow,
  type SpecState,
  type Verdict,
} from './types';
import { schemaFamily } from './ifcfile';

/**
 * The parts of the @ifc-lite/ids report that we read. Declared structurally so
 * the shaping logic can be tested without running a validation.
 */
export interface ReportLike {
  specificationResults: Array<{
    specification: {
      name: string;
      minOccurs?: number;
      maxOccurs?: number | 'unbounded';
      /** The ifcVersion attribute as written. The library's parsed list invents "IFC4" when the attribute is missing or unknown. */
      ifcVersionRaw?: string;
      applicability?: { facets: unknown[] };
    };
    status: string;
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
      requirementResults: Array<{ status: string; failureReason?: string }>;
    }>;
  }>;
}
type SpecResult = ReportLike['specificationResults'][number];

export type Describe<R> = (req: R) => string;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
}

/**
 * Tidy a reason from the library: it quotes some names twice (""Pset_WallCommon""),
 * and gives no full stop, which several reasons in a row need.
 */
export function sentence(s: string): string {
  const t = s.trim().replace(/""([^"]*)""/g, '"$1"');
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Read minOccurs / maxOccurs on the applicability as the standard's three cases. */
export function specKind(spec: SpecResult['specification']): SpecKind {
  if (spec.maxOccurs === 0) return 'prohibited';
  if (spec.minOccurs === 0) return 'optional';
  return 'required';
}

/** True when the specification names nothing to apply to. The library would then apply it to every record in the file. */
export function hasNoApplicability(spec: SpecResult['specification']): boolean {
  return spec.applicability !== undefined && spec.applicability.facets.length === 0;
}

export const NO_APPLICABILITY =
  'This specification does not say which elements it applies to, so it was not checked. Add an applicability to it in the IDS file.';
const NOT_CHECKED = 'This specification could not be checked, so it has no result.';
const PATTERN_REJECTED =
  'This specification was not checked: it uses a text pattern that could take too long to work out. Simplify the pattern in the IDS file.';
const MUST_NOT_EXIST = 'This element must not be in the model.';

/** The sentence shown next to a specification whose listed IFC versions do not include the model's. */
export function schemaNote(ifcVersionRaw: string | undefined, modelSchema: string): string | null {
  const listed = (ifcVersionRaw ?? '').split(/\s+/).filter(Boolean);
  if (listed.length === 0 || !modelSchema) return null;
  if (listed.some((v) => schemaFamily(v) === schemaFamily(modelSchema))) return null;
  return `The model is ${modelSchema}, but this specification lists ${listed.join(', ')}. It was checked anyway: in the IDS standard the listed IFC version does not change the result.`;
}

function unchecked(spec: SpecResult, kind: SpecKind, note: string, modelSchema: string): SpecRow {
  return {
    name: spec.specification.name || '(unnamed specification)',
    state: 'unchecked',
    kind,
    applicable: 0,
    passed: 0,
    failed: 0,
    summary: 'Not checked.',
    note,
    schemaNote: schemaNote(spec.specification.ifcVersionRaw, modelSchema),
    failures: [],
  };
}

export function shapeSpec<R extends { status: string }>(
  spec: SpecResult,
  describe: Describe<R>,
  modelSchema = '',
): SpecRow {
  const kind = specKind(spec.specification);
  if (hasNoApplicability(spec.specification)) return unchecked(spec, kind, NO_APPLICABILITY, modelSchema);
  if (spec.error) return unchecked(spec, kind, /pattern|regex/i.test(spec.error) ? PATTERN_REJECTED : NOT_CHECKED, modelSchema);
  if (spec.status !== 'pass' && spec.status !== 'fail') return unchecked(spec, kind, NOT_CHECKED, modelSchema);

  const applicable = spec.applicableCount;
  const element = (e: SpecResult['entityResults'][number], reasons: string[]): FailingElement => ({
    ifcClass: e.entityType,
    name: e.entityName ?? null,
    globalId: e.globalId ?? null,
    reasons,
  });

  let state: SpecState;
  let passed: number;
  let failed: number;
  let failures: FailingElement[];
  let summary: string;
  let note: string | null = null;

  if (kind === 'prohibited') {
    // The standard: "No [matching element] should be found in the model,
    // requirements are ignored". Every match is a failure, whatever the
    // library's per-element requirement results say.
    passed = 0;
    failed = applicable;
    failures = spec.entityResults.map((e) => element(e, [MUST_NOT_EXIST]));
    if (applicable === 0) {
      state = 'pass';
      summary = 'None found in the model, as this specification asks.';
    } else {
      state = 'fail';
      summary = `Found ${plural(applicable, 'element')} that must not be in the model.`;
      note = `This specification says the model must not contain these elements. It contains ${applicable.toLocaleString('en')}.`;
    }
  } else {
    const failing = spec.entityResults.filter((e) => !e.passed);
    failures = failing.map((e) =>
      element(
        e,
        e.requirementResults
          .filter((r) => r.status === 'fail')
          .map((r) => sentence(r.failureReason?.trim() || describe(r as unknown as R))),
      ),
    );
    // Count from what the report really holds, so the row can never say
    // "0 failed" above a list of failing elements.
    failed = Math.max(spec.failedCount, failing.length);
    passed = Math.max(0, applicable - failed);
    const cardinalityFailed = spec.cardinalityResult?.passed === false;
    if (spec.status === 'fail' || failed > 0 || cardinalityFailed) state = 'fail';
    else if (applicable === 0) state = 'nothing';
    else state = 'pass';

    if (applicable === 0) {
      summary = 'No element in this model matches it.';
      if (state === 'fail') note = 'This specification needs at least one matching element, and the model has none.';
      else note = 'This specification is optional and no element in this model matches it, so there was nothing to check. If you expected matches, look at how the IDS file names the elements.';
    } else {
      summary = `Applied to ${plural(applicable, 'element')}: ${passed.toLocaleString('en')} passed, ${failed.toLocaleString('en')} failed.`;
      if (cardinalityFailed) {
        const { minOccurs: min, maxOccurs: max } = spec.specification;
        const allowed =
          typeof max === 'number' && applicable > max
            ? `at most ${max.toLocaleString('en')}`
            : `at least ${(min ?? 1).toLocaleString('en')}`;
        note = `This specification allows ${allowed} matching ${allowed.endsWith(' 1') ? 'element' : 'elements'}, and the model has ${applicable.toLocaleString('en')}.`;
      }
    }
  }

  if (state === 'fail' && failures.length === 0 && !note) {
    note = 'The check reported this specification as failed without naming an element.';
  }

  return {
    name: spec.specification.name || '(unnamed specification)',
    state,
    kind,
    applicable,
    passed,
    failed,
    summary,
    note,
    schemaNote: schemaNote(spec.specification.ifcVersionRaw, modelSchema),
    failures,
  };
}

/** The failing elements a row lists on the page, and how many more there are. */
export function listed(failures: FailingElement[], cap = FAILURE_CAP): { shown: FailingElement[]; notShown: number } {
  const shown = failures.slice(0, cap);
  return { shown, notShown: failures.length - shown.length };
}

export interface Counts {
  specifications: number;
  passed: number;
  failed: number;
  notChecked: number;
  nothingToCheck: number;
}

export function verdictOf(c: Counts): Verdict {
  if (c.failed > 0 || c.specifications === 0) return 'fail';
  if (c.notChecked > 0) return 'incomplete';
  return 'pass';
}

export function headline(c: Counts): string {
  const total = c.specifications;
  if (total === 0) return 'The IDS file contains no specifications, so there was nothing to check.';
  const parts: string[] = [];
  if (c.passed === total) parts.push(total === 1 ? 'The one specification passed.' : `All ${total} specifications passed.`);
  else parts.push(`${c.passed} of ${plural(total, 'specification')} passed.`);
  if (c.failed > 0 && c.notChecked > 0) parts.push(`${c.failed} failed.`);
  if (c.notChecked > 0) parts.push(`${c.notChecked} could not be checked.`);
  if (c.nothingToCheck > 0) {
    parts.push(`${plural(c.nothingToCheck, 'optional specification')} matched nothing in this model, so there was nothing to check there.`);
  }
  return parts.join(' ');
}

export function shapeReport<R extends { status: string }>(
  report: ReportLike,
  describe: Describe<R>,
  meta: { idsFile: string; ifcFile: string; schema: string; entityCount: number; seconds: number },
): RunResult {
  const specs = report.specificationResults.map((s) => shapeSpec(s, describe, meta.schema));
  const count = (...states: SpecState[]) => specs.filter((s) => states.includes(s.state)).length;
  const counts: Counts = {
    specifications: specs.length,
    passed: count('pass', 'nothing'),
    failed: count('fail'),
    notChecked: count('unchecked'),
    nothingToCheck: count('nothing'),
  };
  const verdict = verdictOf(counts);
  return {
    ...meta,
    specs,
    counts,
    headline: headline(counts),
    verdict,
    allPassed: verdict === 'pass',
    seconds: meta.seconds,
  };
}
