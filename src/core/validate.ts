import { IfcParser } from '@ifc-lite/parser';
import { parseIDS, validateIDS, createTranslationService } from '@ifc-lite/ids';
import type { IDSRequirementResult, IDSDocument } from '@ifc-lite/ids';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { AppError, mapError } from './errors';
import { checkIdsDocument, precheckIdsText } from './idsfile';
import { inspectIfc } from './ifcfile';
import { hasNoApplicability, shapeReport, type ReportLike } from './shape';
import type { RunResult } from './types';

export type Phase = 'reading-ids' | 'reading-ifc' | 'checking';

export interface RunInput {
  /** From readIds(). IDS XML is parsed by the caller because parseIDS needs DOMParser, which a Web Worker lacks. */
  ids: IDSDocument;
  idsName: string;
  ifcBytes: ArrayBuffer;
  ifcName: string;
  onPhase?: (phase: Phase) => void;
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
 * Parse the model, validate, and shape the result.
 * Throws AppError with a plain-language message for every expected failure.
 * Does not touch the DOM, so it runs in a worker or in Node.
 */
export async function runValidation(input: RunInput): Promise<RunResult> {
  const t0 = performance.now();
  const doc = input.ids;
  input.onPhase?.('reading-ifc');
  const header = inspectIfc(input.ifcBytes);
  let store;
  try {
    store = await new IfcParser().parseColumnar(input.ifcBytes);
  } catch (e) {
    console.error('IFC parse failed', e);
    const m = mapError(e, 'ifc');
    throw new AppError(m.kind, m.message);
  }
  if (!store || store.entityCount === 0) {
    throw new AppError('ifc-empty', 'The IFC file has a header but no model data in it, so there is nothing to check. Export the model again.');
  }

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
    const runnable = doc.specifications.filter((s) => !hasNoApplicability(s));
    const report = await validateIDS(
      { ...doc, specifications: runnable },
      createDataAccessor(store),
      { modelId: input.ifcName, schemaVersion: store.schemaVersion, entityCount: store.entityCount },
      { translator },
    );
    if (report.specificationResults.length !== runnable.length) {
      throw new Error('the report does not hold one result per specification');
    }
    let next = 0;
    const specificationResults: ReportLike['specificationResults'] = doc.specifications.map((s) =>
      hasNoApplicability(s)
        ? { specification: s, status: 'not_applicable', applicableCount: 0, passedCount: 0, failedCount: 0, entityResults: [] }
        : report.specificationResults[next++],
    );
    return shapeReport<IDSRequirementResult>(
      { specificationResults },
      (r) => translator.describeFailure(r),
      {
        idsFile: input.idsName,
        ifcFile: input.ifcName,
        schema: header.schema,
        entityCount: store.entityCount,
        seconds: (performance.now() - t0) / 1000,
      },
    );
  } catch (e) {
    console.error('Validation failed', e);
    const m = mapError(e, 'validate');
    throw new AppError(m.kind, m.message);
  }
}
