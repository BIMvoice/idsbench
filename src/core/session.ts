/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// One run, with the parsed model kept between runs. Reading and parsing a model is most of the time of a run, and the
// model does not change when the IDS does, so a run after an edit only needs to check again. The kept copy is used
// only for the very file object it was read from, with the size and last-modified time it had then; for anything
// else the model is read again. Runs in the worker (src/worker.ts) and in Node (the tests).
import { AppError, MODEL_UNREADABLE, OUT_OF_MEMORY, isMemoryError } from './errors';
import { checkEntities, checkSize } from './limits';
import { sha256OfBytes } from './report';
import { loadModel, runValidation, RunStopped, type LoadedModel, type Phase } from './validate';
import type { IDSDocument } from '@ifc-lite/ids';
import type { RunResult } from './types';

/** Which model a run is about. `token` stands for one File object (the page numbers each file it is given). */
export interface ModelRef { token: number; name: string; size: number; lastModified: number }

export const sameModel = (a: ModelRef, b: ModelRef) =>
  a.token === b.token && a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * The bytes a parsed model was read from: how many, and their SHA-256 (null where the browser offers no digest). Taken
 * from the very bytes that were handed to the parser, at the time they were, and kept with the parsed model: a file
 * can change on disk afterwards, and a record of a result has to name what was checked, not what is on disk later.
 */
export interface ModelBytes { bytes: number; sha256: string | null }

/** Holds at most one parsed model. */
export class ModelKeeper {
  private kept: { ref: ModelRef; model: LoadedModel; of: ModelBytes; weight: number } | null = null;
  /** The kept model if, and only if, it is the one `ref` names. */
  get(ref: ModelRef): LoadedModel | null {
    return this.kept && sameModel(this.kept.ref, ref) ? this.kept.model : null;
  }
  /** The bytes the kept model was read from. */
  get of(): ModelBytes | null { return this.kept?.of ?? null; }
  keep(ref: ModelRef, model: LoadedModel, of: ModelBytes = { bytes: ref.size, sha256: null }, weight = 0): void { this.kept = { ref, model, of, weight }; }
  /** The weighed count of entities of the kept model (see limits.ts weighedEntities), 0 when none is kept. */
  get weight(): number { return this.kept?.weight ?? 0; }
  forget(): void { this.kept = null; }
  /** Let go of the kept model unless it was read from the file object `token` stands for (null: let go whatever it is). */
  forgetOthers(token: number | null): void { if (token === null || this.kept?.ref.token !== token) this.kept = null; }
  get ref(): ModelRef | null { return this.kept?.ref ?? null; }
}

/**
 * Which keeper a run uses and what it is held against. The two models of a comparison are held against one budget:
 * the earlier delivery is counted beside the model the worker holds; a model that has to be read lets go of the earlier
 * delivery first (it is read again, and counted again, when the comparison asks for it).
 */
export function keeperFor(slot: 'model' | 'earlier' | undefined, keepers: { model: ModelKeeper; earlier: ModelKeeper }, ref: ModelRef, fresh: boolean): { keeper: ModelKeeper; held: number } {
  if (slot === 'earlier') return { keeper: keepers.earlier, held: keepers.model.weight };
  if (fresh || !keepers.model.get(ref)) keepers.earlier.forget();
  return { keeper: keepers.model, held: keepers.earlier.weight };
}

export interface SessionRequest {
  ids: IDSDocument;
  idsName: string;
  /** The SHA-256 of the IDS file's bytes, if known (see RunInput). */
  idsSha256?: string | null;
  model: ModelRef;
  /** Reads the model's bytes. Called only when the model is not already kept. */
  read: () => Promise<ArrayBuffer>;
  /** Read the model again even if a copy is kept (the person pressed Run again). */
  fresh?: boolean;
  onPhase?: (p: Phase) => void;
  /** Called every so often while the model is counted, parsed and checked; throwing RunStopped from it stops the run. */
  onTick?: () => void;
  spill?: boolean;
  /** Each specification in words, for the CSV. */
  sentences?: (string | null)[] | null;
  /** Also collect what a comparison of two deliveries needs (RunResult.keys). */
  collect?: boolean;
  /** The weighed count of a model held beside this one (the other model of a comparison): both are held against one budget. */
  held?: number;
  /** Stands in for the budget of this browser, in weighed entities (tests lower it). */
  entityLimit?: number;
}

export async function runSession(keeper: ModelKeeper, req: SessionRequest): Promise<{ result: RunResult; reused: boolean; model: ModelBytes }> {
  const t0 = performance.now();
  let loaded = req.fresh ? null : keeper.get(req.model);
  let of = loaded ? keeper.of : null;
  const reused = loaded !== null;
  if (!loaded || !of) {
    // The memory of the model before this one is let go before the next is read.
    keeper.forget();
    checkSize(req.model.size);
    req.onPhase?.('reading-ifc');
    let bytes: ArrayBuffer;
    try {
      bytes = await req.read();
    } catch (e) {
      // A browser refuses to read a file that changed or went away after it was chosen. That is said as what it is.
      console.error('reading the model failed', e);
      throw isMemoryError(e) ? new AppError('out-of-memory', OUT_OF_MEMORY) : new AppError('file-unreadable', MODEL_UNREADABLE);
    }
    // A file that is not the size it was when it was chosen is not trusted to be the file that was chosen.
    if (bytes.byteLength !== req.model.size) throw new AppError('file-unreadable', 'The model changed on disk while it was being read. Choose it again.');
    const weight = checkEntities(bytes, (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory, req.onTick, req.held, req.entityLimit);
    // The digest is of these bytes, the ones parsed below, and is taken before the parser has them.
    of = { bytes: bytes.byteLength, sha256: await sha256OfBytes(bytes) };
    try {
      loaded = await loadModel(bytes, req.onTick);
    } catch (e) { keeper.forget(); throw e; }
    keeper.keep(req.model, loaded, of, weight);
  }
  try {
    const result = await runValidation({
      ids: req.ids, idsName: req.idsName, idsSha256: req.idsSha256, ifcBytes: new ArrayBuffer(0), ifcName: req.model.name,
      loaded, onPhase: req.onPhase, onTick: req.onTick, spill: req.spill, sentences: req.sentences, collect: req.collect,
    });
    // The time of this run: with the reading of the model when it was read, without it when the kept copy was used.
    return { result: { ...result, seconds: (performance.now() - t0) / 1000 }, reused, model: of };
  } catch (e) {
    // Whatever went wrong, the next run starts from the file, not from this copy.
    if (!(e instanceof RunStopped)) keeper.forget();
    throw e;
  }
}
