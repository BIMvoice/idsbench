import { IfcParser } from '@ifc-lite/parser';
import { parseIDS, validateIDS, createTranslationService } from '@ifc-lite/ids';
import type { IDSRequirementResult, IDSDocument } from '@ifc-lite/ids';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { AppError, mapError } from './errors';
import { checkIdsDocument, precheckIdsText } from './idsfile';
import { inspectIfc } from './ifcfile';
import { assembleReport, hasNoApplicability, SpecAccumulator, specKind, type ReportLike, type ShapeOptions } from './shape';
import type { RunResult } from './types';
import { coverageOf, namedByLibrarySpec, tableVersion } from './coverage';

export type Phase = 'reading-ids' | 'reading-ifc' | 'checking';

export interface RunInput {
  /** From readIds(). IDS XML is parsed by the caller because parseIDS needs DOMParser, which a Web Worker lacks. */
  ids: IDSDocument;
  idsName: string;
  ifcBytes: ArrayBuffer;
  ifcName: string;
  onPhase?: (phase: Phase) => void;
  /** Put the failing elements straight into the downloads instead of holding them (see ShapeOptions.spill). Used by the worker. */
  spill?: boolean;
  /** Called every so often while the check runs; throwing from it stops the run (the worker uses this to stop a run that was cancelled). */
  onTick?: () => void;
  /** How many entities one range of the check holds at most (see RANGE_IDS). Tests set it small to force many ranges. */
  rangeIds?: number;
  /** Used instead of reading the bytes again when the model is already read (see ModelKeeper). */
  loaded?: LoadedModel;
}

/** How many entities one range of the check holds at most. A model of no more entities than this is checked as one range. */
export const RANGE_IDS = 400_000;

type Accessor = ReturnType<typeof createDataAccessor>;
/** The same accessor, answering the lists of entities (by class, or all) with only those whose express id is in [lo, hi). */
function inRange(a: Accessor, lo: number, hi: number): Accessor {
  const within = (ids: number[]) => ids.filter((id) => id >= lo && id < hi);
  return { ...a, getEntitiesByType: (t: string) => within(a.getEntitiesByType(t)), getAllEntityIds: () => within(a.getAllEntityIds()) };
}

/**
 * [lo, hi) ranges of express ids that together cover every id, each holding at most `size` entities. They are cut by
 * how many entities there are, not by how large the ids are: ids are often far apart (a model of 277 entities with
 * ids up to 253,724 is ordinary), and ranges of a fixed width of ids would then be thousands, nearly all of them empty,
 * each costing a pass over the model.
 */
export function cutRanges(ids: ArrayLike<number>, size: number): [number, number][] {
  if (ids.length <= size) return [[0, Infinity]];
  const sorted = Float64Array.from(ids).sort();
  const out: [number, number][] = [];
  let lo = 0;
  for (let i = size; i < sorted.length; i += size) {
    const hi = sorted[i];
    // The same id listed twice stays in one range.
    if (hi > lo) { out.push([lo, hi]); lo = hi; }
  }
  out.push([lo, Infinity]);
  return out;
}

function idRanges(store: LoadedModel['store'], size: number): [number, number][] {
  if (store.entityCount <= size) return [[0, Infinity]];
  return cutRanges(createDataAccessor(store).getAllEntityIds(), size);
}

/** A model that is read and ready to be checked against any IDS. Holds the parsed store, which is large: keep at most one. */
export interface LoadedModel {
  store: Awaited<ReturnType<IfcParser['parseColumnar']>>;
  schema: string;
  entityCount: number;
}

/** Parse IDS XML text. Needs DOMParser (main thread or Node), not a Web Worker. */
export function readIds(idsXml: string): IDSDocument {
  precheckIdsText(idsXml);
  let doc: IDSDocument;
  try {
    doc = parseIDS(idsXml);
  } catch (e) {
    console.error('IDS parse failed', e);
    const m = mapError(e, 'ids');
    throw new AppError(m.kind, m.message);
  }
  checkIdsDocument(idsXml, doc);
  return doc;
}

/**
 * Read a model: look at its header, parse it. Throws AppError with a plain-language message for every expected failure.
 * `onTick` is called as the parsing goes on (the parser says how far it is many times a second on a large model);
 * throwing RunStopped from it stops the reading.
 */
export async function loadModel(ifcBytes: ArrayBuffer, onTick?: () => void): Promise<LoadedModel> {
  const header = inspectIfc(ifcBytes);
  let store;
  try {
    store = await new IfcParser().parseColumnar(ifcBytes, onTick ? { onProgress: () => onTick() } : {});
  } catch (e) {
    if (e instanceof RunStopped) throw e;
    console.error('IFC parse failed', e);
    const m = mapError(e, 'ifc');
    throw new AppError(m.kind, m.message);
  }
  if (!store || store.entityCount === 0) {
    throw new AppError('ifc-empty', 'The IFC file has a header but no model data in it, so there is nothing to check. Export the model again.');
  }
  return { store, schema: header.schema, entityCount: store.entityCount };
}

/**
 * Parse the model, validate, and shape the result.
 * Throws AppError with a plain-language message for every expected failure.
 * Does not touch the DOM, so it runs in a worker or in Node.
 */
export async function runValidation(input: RunInput): Promise<RunResult> {
  const t0 = performance.now();
  const doc = input.ids;
  let loaded = input.loaded;
  if (!loaded) {
    input.onPhase?.('reading-ifc');
    loaded = await loadModel(input.ifcBytes, input.onTick);
  }
  const { store } = loaded;

  // The ifcVersion a specification lists is not a condition for checking it.
  // The official test case is named "Specification version is purely metadata
  // and does not impact pass or fail result", so every specification is
  // evaluated whatever the model's schema; shapeReport adds a note where the
  // two differ.
  input.onPhase?.('checking');
  try {
    const translator = createTranslationService('en');
    // A specification with nothing in its applicability would be applied by
    // the library to every record in the file. It is left out of the run and
    // reported as not checked.
    const modelInfo = { modelId: input.ifcName, schemaVersion: store.schemaVersion, entityCount: store.entityCount };
    const onProgress = input.onTick ? () => input.onTick!() : undefined;
    const options: ShapeOptions = input.spill ? { spill: { ifcFile: input.ifcName, idsFile: input.idsName } } : {};
    const accs = doc.specifications.map((s) => new SpecAccumulator<IDSRequirementResult>(s, (r) => translator.describeFailure(r), loaded.schema, options));
    const indexed = doc.specifications.map((s, i) => ({ s, i })).filter(({ s }) => !hasNoApplicability(s));
    // The model is checked one range of express ids at a time, each with its own accessor and its own results, which are
    // let go of before the next range: a model with millions of applicable elements never has all their results (or all
    // the values read from them) in memory at once. A model of ordinary size is one range, as if there were no ranges.
    for (const [lo, hi] of idRanges(store, input.rangeIds ?? RANGE_IDS)) {
      const accessor = hi === Infinity && lo === 0 ? createDataAccessor(store) : inRange(createDataAccessor(store), lo, hi);
      // Elements that pass are not needed for anything but a prohibited specification (every match of it is a failure
      // whatever its requirements say), so the library is asked to drop them from all the others: on a model with
      // millions of elements that is most of the memory of a run. The counts it reports are the same either way.
      for (const keepPassing of [false, true]) {
        const part = indexed.filter(({ s }) => (specKind(s) === 'prohibited') === keepPassing);
        if (part.length === 0) continue;
        const report = await validateIDS(
          { ...doc, specifications: part.map(({ s }) => s) },
          accessor,
          modelInfo,
          { translator, includePassingEntities: keepPassing, onProgress },
        );
        if (report.specificationResults.length !== part.length) {
          throw new Error('the report does not hold one result per specification');
        }
        part.forEach(({ i }, k) => {
          const r = report.specificationResults[k] as ReportLike['specificationResults'][number];
          accs[i].feed(r);
          r.entityResults = [];
        });
      }
    }
    for (const [i, s] of doc.specifications.entries()) {
      if (hasNoApplicability(s)) accs[i].feed({ specification: s, status: 'not_applicable', applicableCount: 0, passedCount: 0, failedCount: 0, entityResults: [] });
    }
    const done = accs.map((a) => a.finish());
    await addCoverage(done.map((d) => d.row), doc, store, loaded.schema);
    return assembleReport(
      done.map((d) => d.row),
      input.spill ? done.map((d) => d.spilled) : null,
      { idsFile: input.idsName, ifcFile: input.ifcName, schema: loaded.schema, entityCount: loaded.entityCount, seconds: (performance.now() - t0) / 1000 },
    );
  } catch (e) {
    if (e instanceof RunStopped) throw e;
    console.error('Validation failed', e);
    const m = mapError(e, 'validate');
    throw new AppError(m.kind, m.message);
  }
}

/**
 * Beside each specification that names a class: the elements of its subtypes, supertype or siblings that the model holds
 * and the specification does not cover. Reads the model's class counts only; it changes no count, state or verdict. The
 * sentence is also added to the reason a specification failed as a whole, so that the CSV row says it too.
 */
async function addCoverage(rows: RunResult['specs'], doc: IDSDocument, store: LoadedModel['store'], modelSchema: string): Promise<void> {
  const version = tableVersion(modelSchema);
  const byType = store.entityIndex?.byType;
  if (!version || !byType) return;
  let tables: Awaited<ReturnType<typeof import('@idsbench/check/ifc').loadSchema>> | null = null;
  for (const [i, row] of rows.entries()) {
    if (row.state === 'unchecked') continue;
    const names = namedByLibrarySpec(doc.specifications[i] as never);
    if (!names) continue;
    try {
      tables ??= await (await import('@idsbench/check/ifc')).loadSchema(version);
      const coverage = coverageOf(names.named, row.applicable, (u) => byType.get(u)?.length ?? 0, tables, names.other);
      if (!coverage) continue;
      row.coverage = coverage;
      if (row.wholeFailure) row.wholeFailure = `${row.wholeFailure} ${coverage.text}`;
    } catch (e) {
      // The hint is an extra: a table that cannot be loaded leaves the result as it is.
      console.error('class coverage skipped', e);
    }
  }
}

/** Thrown from onTick to stop a run. Never a failure to show. */
export class RunStopped extends Error {}
