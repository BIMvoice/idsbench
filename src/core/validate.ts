/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IfcParser } from '@ifc-lite/parser';
import { parseIDS, validateIDS, createTranslationService } from '@ifc-lite/ids';
import type { IDSRequirementResult, IDSDocument } from '@ifc-lite/ids';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { AppError, mapError } from './errors';
import { checkIdsDocument, precheckIdsText } from './idsfile';
import { inspectIfc } from './ifcfile';
import { assembleReport, hasIdsOccurs, hasNoApplicability, SpecAccumulator, specKind, type ReportLike, type ShapeOptions } from './shape';
import type { RunResult } from './types';
import { coverageOf, namedByLibrarySpec, tableVersion } from './coverage';
import { CLASS_NAME, declaredFolded, FOLDED_ONTO, foldEffect, withheldSentence } from './foldguard';

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
  /** Each specification in words, in the order of the IDS file, for the CSV (see core/sentences.ts); null where there is none. */
  sentences?: (string | null)[] | null;
  /** Also collect every failing element and the GlobalIds of the model (RunResult.keys), for comparing two deliveries. */
  collect?: boolean;
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
  const doc = namedOnce(input.ids);
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
    // The IFC tables of the model's version: a reason may depend on them (an attribute the element's class does not have).
    const known = await tablesFor(loaded.schema);
    // Said only of a class and an attribute the tables know; of anything else nothing is claimed.
    const reasons = known ? { hasAttribute: (cls: string, attribute: string) => (known.classes.has(cls.toUpperCase()) ? known.attributes.get(attribute)?.classes.includes(cls.toUpperCase()) : undefined) } : undefined;
    const options: ShapeOptions = { ...(input.spill ? { spill: { ifcFile: input.ifcName, idsFile: input.idsName } } : {}), ...(reasons ? { reasons } : {}), ...(input.collect ? { collect: true } : {}) };
    // The storey or space of a failing element is read from the part of the model being checked (the accessor of its range).
    const placer: { find: (id: number) => string } = { find: () => '' };
    const place = (id: number) => placer.find(id);
    const sentences = input.sentences && input.sentences.length === doc.specifications.length ? input.sentences : null;
    // The engine of this version reads ten classes as their parent (see core/foldguard.ts). A model that declares none of
    // them is untouched. Otherwise a specification the fold changes is run with the class the file declares, or, where
    // that cannot be proved, not run: its row is "Not checked".
    const present = declaredFolded((u) => store.entityIndex?.byType?.get(u)?.length ?? 0);
    const ifc2x3 = (store.schemaVersion ?? '').toUpperCase() === 'IFC2X3';
    const effects = doc.specifications.map((s) => (hasNoApplicability(s) ? null : foldEffect(s, present, ifc2x3)));
    const withheld = effects.map((e) => (e && !e.correctable ? withheldSentence(e.classes) : undefined));
    const declared = new Set(effects.flatMap((e, i) => (e?.correctable ? [i] : [])));
    const accs = doc.specifications.map((s, i) => new SpecAccumulator<IDSRequirementResult>(s, (r) => translator.describeFailure(r), loaded.schema, { ...options, place, ...(sentences?.[i] ? { sentence: sentences[i]! } : {}), ...(withheld[i] ? { withheld: withheld[i] } : {}) }));
    // A number of matching elements IDS 1.0 does not have is not run either (see hasIdsOccurs): its row is "Not checked".
    const indexed = doc.specifications.map((s, i) => ({ s, i })).filter(({ s, i }) => !hasNoApplicability(s) && hasIdsOccurs(s) && !withheld[i]);
    // The model is checked one range of express ids at a time, each with its own accessor and its own results, which are
    // let go of before the next range: a model with millions of applicable elements never has all their results (or all
    // the values read from them) in memory at once. A model of ordinary size is one range, as if there were no ranges.
    for (const [lo, hi] of idRanges(store, input.rangeIds ?? RANGE_IDS)) {
      const accessor = hi === Infinity && lo === 0 ? createDataAccessor(store) : inRange(createDataAccessor(store), lo, hi);
      placer.find = placeFinder(accessor, known ? (t) => known.isA(t.toUpperCase(), 'IFCSPATIALELEMENT') || known.isA(t.toUpperCase(), 'IFCSPATIALSTRUCTUREELEMENT') : undefined);
      // Elements that pass are not needed for anything but a prohibited specification (every match of it is a failure
      // whatever its requirements say), so the library is asked to drop them from all the others: on a model with
      // millions of elements that is most of the memory of a run. The counts it reports are the same either way.
      for (const [keepPassing, asDeclared] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        const part = indexed.filter(({ s, i }) => (specKind(s) === 'prohibited') === keepPassing && declared.has(i) === asDeclared);
        if (part.length === 0) continue;
        const report = await validateIDS(
          { ...doc, specifications: part.map(({ s }) => s) },
          asDeclared ? declaring(accessor, store.entityIndex?.byId) : accessor,
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
    const tables = await addCoverage(done.map((d) => d.row), doc, store, loaded.schema);
    const result = assembleReport(
      done.map((d) => d.row),
      input.spill ? done.map((d) => d.spilled) : null,
      { idsFile: input.idsName, ifcFile: input.ifcName, schema: loaded.schema, entityCount: loaded.entityCount, ...elementsIn(store, tables), seconds: (performance.now() - t0) / 1000 },
    );
    if (input.collect) result.keys = { globalIds: globalIdsOf(store, input.onTick), failing: accs.map((a) => a.collected()) };
    return result;
  } catch (e) {
    if (e instanceof RunStopped) throw e;
    console.error('Validation failed', e);
    const m = mapError(e, 'validate');
    throw new AppError(m.kind, m.message);
  }
}

/** The GlobalId of every entity of the model that has one (for comparing two deliveries: an element not among them is not in the model). */
export function globalIdsOf(store: LoadedModel['store'], onTick?: () => void): string[] {
  const accessor = createDataAccessor(store);
  const out: string[] = [];
  const ids = accessor.getAllEntityIds();
  for (let i = 0; i < ids.length; i++) {
    const g = accessor.getGlobalId(ids[i]);
    if (g) out.push(g);
    if (onTick && i % 100_000 === 99_999) onTick();
  }
  return out;
}

/**
 * The same document, with a class that a list of an entity facet in the applicability names more than once named once.
 * The library collects the elements of each name of the list in turn and does not look for one it already has, so every
 * element of a class written twice was counted, and listed, twice. Names are compared as the library compares them, in
 * capitals. A document without such a list is returned as it is.
 */
function namedOnce(doc: IDSDocument): IDSDocument {
  const once = (values: string[]) => values.filter((v, i) => values.findIndex((w) => w.toUpperCase() === v.toUpperCase()) === i);
  const repeats = (f: IDSDocument['specifications'][number]['applicability']['facets'][number]) => f.type === 'entity' && f.name.type === 'enumeration' && once(f.name.values).length !== f.name.values.length;
  if (!doc.specifications.some((s) => s.applicability.facets.some(repeats))) return doc;
  return {
    ...doc,
    specifications: doc.specifications.map((s) => (s.applicability.facets.some(repeats)
      ? { ...s, applicability: { ...s.applicability, facets: s.applicability.facets.map((f) => (f.type === 'entity' && f.name.type === 'enumeration' ? { ...f, name: { ...f.name, values: once(f.name.values) } } : f)) } }
      : s)),
  };
}

/** The same accessor, answering for an element of one of the ten folded classes the class its STEP line declares (read from the entity index, which keeps it as written). */
function declaring(a: Accessor, byId: { get(id: number): { type: string } | undefined } | undefined): Accessor {
  if (!byId) return a;
  return {
    ...a,
    getEntityType: (id: number) => {
      const declared = byId.get(id)?.type?.toUpperCase();
      return declared && FOLDED_ONTO[declared] ? CLASS_NAME[declared] : a.getEntityType(id);
    },
  };
}

/** The classes that are a place in a model (a storey, a space, a building, a site, and what IFC4X3 adds to them), told by name where the IFC tables are not at hand. */
const SPATIAL = /^Ifc(BuildingStorey|Space|Building|Site|SpatialZone|ExternalSpatialElement|Facility|FacilityPart\w*|Bridge|BridgePart|Road|RoadPart|Railway|RailwayPart|MarineFacility|MarinePart)$/i;

/**
 * Where the model puts an element: the name of the storey or space that contains it. An element that is a component of
 * another (a panel of a curtain wall, a flight of a stair) is where the whole is, and a space is on the storey it is a
 * component of: the way up is followed until a storey, a space, a building or a site is reached. The name of the stair
 * is not a storey, so it is never given as one. Empty when the model does not say, or the place has no name. A space is
 * marked "(space)", and a building or a site (an element placed in no storey) by its kind. The name of a place is
 * looked up once.
 */
export function placeFinder(accessor: Accessor, isPlace: (entityType: string) => boolean = (t) => SPATIAL.test(t)): (expressId: number) => string {
  const labels = new Map<number, string>();
  const up = (id: number) => accessor.getParent?.(id, 'IfcRelContainedInSpatialStructure') ?? accessor.getParent?.(id, 'IfcRelAggregates');
  return (id) => {
    let parent = up(id);
    // A model may be written with a loop in it; the way up is not followed for ever.
    for (let hops = 0; parent && !isPlace(parent.entityType) && hops < 32; hops++) parent = up(parent.expressId);
    if (!parent || !isPlace(parent.entityType)) return '';
    let label = labels.get(parent.expressId);
    if (label === undefined) {
      const name = accessor.getEntityName(parent.expressId)?.trim();
      const kind = /^IfcBuildingStorey$/i.test(parent.entityType) ? '' : /space/i.test(parent.entityType) ? 'space' : parent.entityType.replace(/^Ifc/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      label = name ? (kind ? `${name} (${kind})` : name) : '';
      labels.set(parent.expressId, label);
    }
    return label;
  };
}

/**
 * Beside each specification that names a class: the elements of its subtypes, supertype or siblings that the model holds
 * and the specification does not cover. Reads the model's class counts only; it changes no count, state or verdict. The
 * sentence is also added to the reason a specification failed as a whole, so that the CSV row says it too.
 */
type Tables = Awaited<ReturnType<typeof import('@idsbench/check/ifc').loadSchema>>;

/**
 * What the model holds that can be built or fitted (IfcElement and its subtypes: walls, doors, slabs, equipment), with two
 * kinds left out: the feature subtractions (IfcFeatureElementSubtraction: openings, which are the hole in a wall and not a
 * thing of its own) and IfcVirtualElement (a boundary that has no substance). Feature additions (IfcProjectionElement,
 * IfcSurfaceFeature) are counted. Apart from these, the spaces. A site,
 * a building, a storey and the other places are neither. Empty when the IFC tables of the model's version cannot be had.
 */
function elementsIn(store: LoadedModel['store'], tables: Tables | null): { elementCount?: number; spaceCount?: number } {
  const byType = store.entityIndex?.byType;
  if (!tables || !byType) return {};
  let elements = 0, spaces = 0;
  for (const [type, ids] of byType) {
    const u = type.toUpperCase();
    if (tables.isA(u, 'IFCELEMENT') && !tables.isA(u, 'IFCFEATUREELEMENTSUBTRACTION') && !tables.isA(u, 'IFCVIRTUALELEMENT')) elements += ids.length;
    else if (tables.isA(u, 'IFCSPACE')) spaces += ids.length;
  }
  return { elementCount: elements, spaceCount: spaces };
}

/** The IFC tables of a model's version; null when the version is not one of the three, or they cannot be had. */
async function tablesFor(modelSchema: string): Promise<Tables | null> {
  const version = tableVersion(modelSchema);
  if (!version) return null;
  try { return await (await import('@idsbench/check/ifc')).loadSchema(version); } catch (e) { console.error('IFC tables not loaded', e); return null; }
}

async function addCoverage(rows: RunResult['specs'], doc: IDSDocument, store: LoadedModel['store'], modelSchema: string): Promise<Tables | null> {
  const byType = store.entityIndex?.byType;
  if (!byType) return null;
  const tables = await tablesFor(modelSchema);
  if (!tables) return null;
  for (const [i, row] of rows.entries()) {
    if (row.state === 'unchecked') continue;
    const names = namedByLibrarySpec(doc.specifications[i] as never);
    if (!names) continue;
    try {
      const coverage = coverageOf(names.named, row.applicable, (u) => byType.get(u)?.length ?? 0, tables, names.other);
      if (!coverage) continue;
      row.coverage = coverage;
      if (row.wholeFailure) row.wholeFailure = `${row.wholeFailure} ${coverage.text}`;
    } catch (e) {
      // The hint is an extra: a table that cannot be loaded leaves the result as it is.
      console.error('class coverage skipped', e);
    }
  }
  return tables;
}

/** Thrown from onTick to stop a run. Never a failure to show. */
export class RunStopped extends Error {}
