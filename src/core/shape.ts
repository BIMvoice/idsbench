/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  FAILURE_CAP,
  type FailingElement,
  type RunResult,
  type Spilled,
  type SpecKind,
  type SpecRow,
  type SpecState,
  type Verdict,
} from './types';
import { schemaFamily } from './ifcfile';
import { GroupAccumulator } from './groups';
import { elementCsvRow } from './csv';
import { reasonOf, REMOVE_ELEMENT, whatToFix, type ReasonContext, type RequirementOutcome } from './reasons';

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
      expressId?: number;
      entityType: string;
      entityName?: string;
      globalId?: string;
      passed: boolean;
      requirementResults: RequirementOutcome[];
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
  const t = s.trim().replace(/""([^"]*)""/g, '"$1"').replace(/\bpattern pattern "/g, 'pattern "');
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

/**
 * True when the specification allows one of the three numbers of matching elements IDS 1.0 has: at least one
 * (minOccurs 1, maxOccurs unbounded), any (0, unbounded) or none (0, 0). A missing minOccurs is read as 1 by the library.
 * Any other number is not allowed by the standard ("Other configurations of minOccurs and maxOccurs are currently not
 * allowed", developer guide), and the library and IfcTester read it differently (the library fails "at most 2" for 3
 * matches; IfcTester looks only at whether each is 0), so such a specification gets no result.
 */
export function hasIdsOccurs(spec: SpecResult['specification']): boolean {
  const min = spec.minOccurs ?? 1;
  const max = spec.maxOccurs ?? 'unbounded';
  return max === 'unbounded' ? min === 0 || min === 1 : max === 0 && min === 0;
}

export const OCCURS_NOT_IDS =
  'This specification was not checked: it allows a number of matching elements that IDS 1.0 does not have. IDS allows only three choices: at least one, any number including none, or none. Choose one of them in the IDS file.';

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
    failureTotal: 0,
    groups: [],
    notListed: 0,
  };
}

/** Pieces of text for the two downloads: gathered in chunks and handed to the browser as blobs, so that they need not stay in memory as strings. */
class Chunks {
  private parts: string[] = [];
  private chars = 0;
  readonly blobs: Blob[] = [];
  add(text: string): void {
    this.parts.push(text);
    this.chars += text.length;
    if (this.chars >= 1 << 20) this.flush();
  }
  flush(): void {
    if (this.parts.length) this.blobs.push(new Blob([this.parts.join('')]));
    this.parts = [];
    this.chars = 0;
  }
}

export interface ShapeOptions {
  /**
   * Put every failing element straight into the two downloads (the result then holds only the first FAILURE_CAP of
   * them in `failures`, and the complete text in `spilled`). Used by the worker, where a result of millions of
   * elements would not fit in memory twice. Without it the row holds every failing element.
   */
  spill?: { ifcFile: string; idsFile: string };
  /** The specification in words, for the CSV (see core/sentences.ts). Absent: the column is left empty. */
  sentence?: string;
  /** What the IFC tables of the model's version say, for reasons that depend on them (an attribute the class does not have). */
  reasons?: ReasonContext;
  /** The storey or space an element is in, by its express id, when the model says. Set by the run for the part of the model being checked. */
  place?: (expressId: number) => string;
  /** Set when the result of this specification is not given because the engine would answer it wrongly (see core/foldguard.ts): the sentence that says so. The row is then "Not checked". */
  withheld?: string;
  /** Also keep every failing element and what the specification applies to, for comparing two deliveries, as long as the budget lasts. */
  collect?: KeyBudget;
}

/** How many keys a run made for a comparison may still keep, shared by all its specifications (see CompareKeys.tooMany). */
export class KeyBudget {
  used = 0;
  over = false;
  constructor(readonly limit: number) {}
  /** Count one more key; false (and from then on always false) once the limit is passed. */
  take(): boolean {
    if (this.over) return false;
    if (++this.used > this.limit) this.over = true;
    return !this.over;
  }
}

/** Takes failing elements one at a time: counts them exactly, groups them by reason, holds what the page lists, and (if asked) writes the rest to the downloads. */
class Failures {
  total = 0;
  readonly held: FailingElement[] = [];
  /** Every failing element, kept only when ShapeOptions.collect is set. */
  readonly all: FailingElement[] = [];
  readonly groups = new GroupAccumulator(FAILURE_CAP);
  private csv: Chunks | null;
  private json: Chunks | null;
  constructor(private name: string, private options: ShapeOptions) {
    this.csv = options.spill ? new Chunks() : null;
    this.json = options.spill ? new Chunks() : null;
  }
  add(f: FailingElement): void {
    if (this.options.spill && this.csv && this.json) {
      this.csv.add(elementCsvRow(this.name, f, this.options.spill.ifcFile, this.options.spill.idsFile, this.options.sentence ?? ''));
      this.json.add(`${this.total ? ',' : ''}${JSON.stringify(f)}`);
      if (this.held.length < FAILURE_CAP) this.held.push(f);
    } else {
      this.held.push(f);
    }
    if (this.options.collect?.take()) this.all.push(f);
    this.total++;
    this.groups.add(f);
  }
  spilled(): Spilled | null {
    if (!this.csv || !this.json || this.total === 0) return null;
    this.csv.flush();
    this.json.flush();
    return { csv: this.csv.blobs, failures: this.json.blobs };
  }
}

export function shapeSpec<R extends { status: string }>(
  spec: SpecResult,
  describe: Describe<R>,
  modelSchema = '',
): SpecRow {
  return shapeSpecInto(spec, describe, modelSchema, {}).row;
}

/** What the library says of a specification's cardinality for `count` matching elements (the same rule, for a count added up from several parts of a model). */
function cardinalityOf(spec: SpecResult['specification'], count: number): SpecResult['cardinalityResult'] {
  if (spec.minOccurs === undefined && spec.maxOccurs === undefined) return undefined;
  const min = spec.minOccurs ?? 0;
  const tooFew = count < min;
  const tooMany = spec.maxOccurs !== 'unbounded' && spec.maxOccurs !== undefined && count > spec.maxOccurs;
  return { passed: !tooFew && !tooMany, message: '' };
}

/** The library's status of a specification, from counts added up from several parts of a model. */
function statusOf(count: number, failed: number, cardinality: SpecResult['cardinalityResult']): string {
  if (count === 0) return cardinality?.passed === false ? 'fail' : cardinality?.passed === true ? 'pass' : 'not_applicable';
  return failed > 0 || cardinality?.passed === false ? 'fail' : 'pass';
}

/**
 * The row of one specification, built from its results fed in one part of the model at a time (feed), so that the
 * failing elements of a very large model are never all held at once. One feed is the whole model.
 */
export class SpecAccumulator<R extends { status: string }> {
  private fails: Failures;
  private applicable = 0;
  private failedCount = 0;
  private parts = 0;
  private error: string | undefined;
  private last: SpecResult | undefined;

  constructor(private spec: SpecResult['specification'], private describe: Describe<R>, private modelSchema: string, private options: ShapeOptions = {}) {
    this.fails = new Failures(spec.name || '(unnamed specification)', options);
  }

  feed(r: SpecResult): void {
    this.parts++;
    this.applicable += r.applicableCount;
    this.failedCount += r.failedCount;
    this.error ??= r.error;
    this.last = r;
    if (hasNoApplicability(this.spec) || r.error || (r.status !== 'pass' && r.status !== 'fail' && r.status !== 'not_applicable')) return;
    if (this.options.collect) for (const e of r.entityResults) if (e.globalId && this.options.collect.take()) this.applicableIds.push(e.globalId);
    const element = (e: SpecResult['entityResults'][number], reasons: string[], found?: (string | null)[]): FailingElement => {
      const el: FailingElement = { ifcClass: e.entityType, name: e.entityName ?? null, globalId: e.globalId ?? null, reasons };
      const place = e.expressId !== undefined ? this.options.place?.(e.expressId) : undefined;
      if (place) el.place = place;
      if (found && found.some((v) => v !== null)) el.found = found;
      return el;
    };
    if (specKind(this.spec) === 'prohibited') {
      // The standard: "No [matching element] should be found in the model,
      // requirements are ignored". Every match is a failure, whatever the
      // library's per-element requirement results say.
      for (const e of r.entityResults) this.fails.add({ ...element(e, [MUST_NOT_EXIST]), toFix: [REMOVE_ELEMENT] });
      return;
    }
    for (const e of r.entityResults) {
      if (e.passed) continue;
      const failedReqs = e.requirementResults.filter((q) => q.status === 'fail');
      const reasons = failedReqs.map((q) => sentence(reasonOf(q, e.entityType, this.options.reasons) ?? (q.failureReason?.trim() || this.describe(q as unknown as R))));
      // The value the element has, where the reason quotes it: what differs from element to element in an otherwise equal reason.
      const found = failedReqs.map((q, i) => (q.actualValue && reasons[i].includes(`"${q.actualValue}"`) ? q.actualValue : null));
      const el = element(e, reasons, found);
      const toFix = failedReqs.map((q) => whatToFix(q, e.entityType, this.options.reasons));
      if (toFix.some(Boolean)) el.toFix = toFix;
      this.fails.add(el);
    }
  }

  /** Every failing element fed so far; empty unless ShapeOptions.collect was set. */
  collected(): FailingElement[] { return this.fails.all; }
  /** The GlobalIds of every element the specification applied to (the run must keep the passing ones); empty unless ShapeOptions.collect was set. */
  readonly applicableIds: string[] = [];

  finish(): { row: SpecRow; spilled: Spilled | null } {
    const { spec, modelSchema, fails } = this;
    const kind = specKind(spec);
    const raw = { specification: spec } as SpecResult;
    const no = (note: string) => ({ row: unchecked(raw, kind, note, modelSchema), spilled: null });
    if (hasNoApplicability(spec)) return no(NO_APPLICABILITY);
    if (!hasIdsOccurs(spec)) return no(OCCURS_NOT_IDS);
    if (this.options.withheld) return { row: { ...unchecked(raw, kind, this.options.withheld, modelSchema), withheld: this.options.withheld, ...(this.options.sentence ? { requirement: this.options.sentence } : {}) }, spilled: null };
    if (this.error) return no(/pattern|regex/i.test(this.error) ? PATTERN_REJECTED : NOT_CHECKED);
    // One part of the model: the library's own cardinality and status. Several: the same rules over the added-up counts.
    const merged = this.parts > 1;
    const cardinalityResult = merged ? cardinalityOf(spec, this.applicable) : this.last?.cardinalityResult;
    const status = merged ? statusOf(this.applicable, this.failedCount, cardinalityResult) : this.last?.status;
    if (status !== 'pass' && status !== 'fail') return no(NOT_CHECKED);

    const applicable = this.applicable;
    let state: SpecState;
    let passed: number;
    let failed: number;
    let summary: string;
    let note: string | null = null;
    let wholeFailure: string | undefined;
    let wholeFix: string | undefined;

    if (kind === 'prohibited') {
      passed = 0;
      failed = applicable;
      if (applicable === 0) {
        state = 'pass';
        summary = 'None found in the model, as this specification asks.';
      } else {
        state = 'fail';
        summary = `Found ${plural(applicable, 'element')} that must not be in the model.`;
        note = `This specification says the model must not contain these elements. It contains ${applicable.toLocaleString('en')}.`;
      }
    } else {
      // Count from what the report really holds, so the row can never say
      // "0 failed" above a list of failing elements.
      failed = Math.max(this.failedCount, fails.total);
      passed = Math.max(0, applicable - failed);
      const cardinalityFailed = cardinalityResult?.passed === false;
      if (status === 'fail' || failed > 0 || cardinalityFailed) state = 'fail';
      else if (applicable === 0) state = 'nothing';
      else state = 'pass';

      if (applicable === 0) {
        summary = 'No element in this model matches it.';
        if (state === 'fail') { note = 'This specification needs at least one matching element, and the model has none.'; wholeFailure = note; wholeFix = 'Add the elements this specification applies to, or change the specification'; }
        else note = 'This specification is optional and no element in this model matches it, so there was nothing to check. If you expected matches, look at how the IDS file names the elements.';
      } else {
        // A specification with matches cannot fail by their number: it allows at least one or any (see hasIdsOccurs).
        summary = `Applied to ${plural(applicable, 'element')}: ${passed.toLocaleString('en')} passed, ${failed.toLocaleString('en')} failed.`;
      }
    }

    if (state === 'fail' && fails.total === 0 && !note) {
      note = 'The check reported this specification as failed without naming an element.';
      wholeFailure = note;
      wholeFix = 'Look at the specification and the model together';
    }
    const { shown, notShown } = fails.groups.shown();
    const spilled = fails.spilled();
    const row: SpecRow = {
      name: spec.name || '(unnamed specification)',
      state,
      kind,
      applicable,
      passed,
      failed,
      summary,
      note,
      schemaNote: schemaNote(spec.ifcVersionRaw, modelSchema),
      failures: fails.held,
      failureTotal: fails.total,
      groups: shown,
      notListed: notShown,
      ...(wholeFailure ? { wholeFailure, wholeFix } : {}),
      ...(this.options.sentence ? { requirement: this.options.sentence } : {}),
    };
    return { row, spilled };
  }
}

function shapeSpecInto<R extends { status: string }>(
  spec: SpecResult,
  describe: Describe<R>,
  modelSchema: string,
  options: ShapeOptions,
): { row: SpecRow; spilled: Spilled | null } {
  const acc = new SpecAccumulator(spec.specification, describe, modelSchema, options);
  acc.feed(spec);
  return acc.finish();
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

/** The counts, headline and verdict of rows already made. */
export function assembleReport(
  specs: SpecRow[],
  spilled: (Spilled | null)[] | null,
  meta: { idsFile: string; ifcFile: string; schema: string; entityCount: number; elementCount?: number; spaceCount?: number; seconds: number },
): RunResult {
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
    ...(spilled ? { spilled } : {}),
  };
}

export function shapeReport<R extends { status: string }>(
  report: ReportLike,
  describe: Describe<R>,
  meta: { idsFile: string; ifcFile: string; schema: string; entityCount: number; seconds: number },
  options: ShapeOptions = {},
): RunResult {
  const spilled: (Spilled | null)[] = [];
  const specs = report.specificationResults.map((s) => {
    const { row, spilled: pieces } = shapeSpecInto(s, describe, meta.schema, options);
    spilled.push(pieces);
    // The library's per-element results are not needed again: let go of them now, one specification at a time.
    s.entityResults = [];
    return row;
  });
  return assembleReport(specs, options.spill ? spilled : null, meta);
}
