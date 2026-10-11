import { IfcParser } from '@ifc-lite/parser';
import { parseIDS, validateIDS, createTranslationService } from '@ifc-lite/ids';
import type { IDSRequirementResult, IDSDocument } from '@ifc-lite/ids';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { AppError, mapError } from './errors';
import { shapeReport } from './shape';
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

/** "IFC4X3_ADD2" and "IFC4X3" are the same family for the purpose of matching. */
function family(v: string): string {
  const u = v.toUpperCase();
  return u.startsWith('IFC4X3') ? 'IFC4X3' : u;
}

const STEP_MAGIC = /ISO-10303-21/;

function looksLikeStep(bytes: ArrayBuffer): boolean {
  const head = new TextDecoder('latin1').decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2048)));
  return STEP_MAGIC.test(head);
}

/** Parse IDS XML text. Needs DOMParser (main thread or Node), not a Web Worker. */
export function readIds(idsXml: string): IDSDocument {
  try {
    return parseIDS(idsXml);
  } catch (e) {
    console.error('IDS parse failed', e);
    const m = mapError(e, 'ids');
    throw new AppError(m.kind, m.message);
  }
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
  let store;
  try {
    if (!looksLikeStep(input.ifcBytes)) throw new Error('not a STEP file (no ISO-10303-21 header)');
    store = await new IfcParser().parseColumnar(input.ifcBytes);
    if (!store || store.entityCount === 0) throw new Error('no entities found');
  } catch (e) {
    console.error('IFC parse failed', e);
    const m = mapError(e, 'ifc');
    throw new AppError(m.kind, m.message);
  }

  const modelFamily = family(String(store.schemaVersion));
  const targets = doc.specifications.map((s) => s.ifcVersions.map(family));
  if (doc.specifications.length > 0 && targets.every((t) => !t.includes(modelFamily))) {
    const wanted = [...new Set(targets.flat())].join(', ') || 'no schema';
    throw new AppError(
      'schema-mismatch',
      `This IDS targets ${wanted}, but the model is ${store.schemaVersion}. Open a model of a matching IFC schema, or change which schema the IDS targets.`,
    );
  }

  input.onPhase?.('checking');
  try {
    const translator = createTranslationService('en');
    const report = await validateIDS(
      doc,
      createDataAccessor(store),
      { modelId: input.ifcName, schemaVersion: store.schemaVersion, entityCount: store.entityCount },
      { translator },
    );
    // A specification that targets another schema than the model cannot pass.
    report.specificationResults.forEach((r, i) => {
      if (targets[i] && !targets[i].includes(modelFamily) && r.status !== 'fail') {
        r.status = 'fail';
        r.error = `This specification targets ${targets[i].join(', ')}, but the model is ${store.schemaVersion}.`;
      }
    });
    return shapeReport<IDSRequirementResult>(
      report,
      (r) => translator.describeFailure(r),
      {
        idsFile: input.idsName,
        ifcFile: input.ifcName,
        schema: String(store.schemaVersion),
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
