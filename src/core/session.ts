// One run, with the parsed model kept between runs. Reading and parsing a model is most of the time of a run, and the
// model does not change when the IDS does, so a run after an edit only needs to check again. The kept copy is used
// only for the very file object it was read from, with the size and last-modified time it had then; for anything
// else the model is read again. Runs in the worker (src/worker.ts) and in Node (the tests).
import { AppError } from './errors';
import { checkEntities, checkSize } from './limits';
import { loadModel, runValidation, RunStopped, type LoadedModel, type Phase } from './validate';
import type { IDSDocument } from '@ifc-lite/ids';
import type { RunResult } from './types';

/** Which model a run is about. `token` stands for one File object (the page numbers each file it is given). */
export interface ModelRef { token: number; name: string; size: number; lastModified: number }

export const sameModel = (a: ModelRef, b: ModelRef) =>
  a.token === b.token && a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Holds at most one parsed model. */
export class ModelKeeper {
  private kept: { ref: ModelRef; model: LoadedModel } | null = null;
  /** The kept model if, and only if, it is the one `ref` names. */
  get(ref: ModelRef): LoadedModel | null {
    return this.kept && sameModel(this.kept.ref, ref) ? this.kept.model : null;
  }
  keep(ref: ModelRef, model: LoadedModel): void { this.kept = { ref, model }; }
  forget(): void { this.kept = null; }
  get ref(): ModelRef | null { return this.kept?.ref ?? null; }
}

export interface SessionRequest {
  ids: IDSDocument;
  idsName: string;
  model: ModelRef;
  /** Reads the model's bytes. Called only when the model is not already kept. */
  read: () => Promise<ArrayBuffer>;
  /** Read the model again even if a copy is kept (the person pressed Run again). */
  fresh?: boolean;
  onPhase?: (p: Phase) => void;
  onTick?: () => void;
  spill?: boolean;
}

export async function runSession(keeper: ModelKeeper, req: SessionRequest): Promise<{ result: RunResult; reused: boolean }> {
  const t0 = performance.now();
  let loaded = req.fresh ? null : keeper.get(req.model);
  const reused = loaded !== null;
  if (!loaded) {
    // The memory of the model before this one is let go before the next is read.
    keeper.forget();
    checkSize(req.model.size);
    req.onPhase?.('reading-ifc');
    const bytes = await req.read();
    // A file that is not the size it was when it was chosen is not trusted to be the file that was chosen.
    if (bytes.byteLength !== req.model.size) throw new AppError('file-unreadable', 'The model changed on disk while it was being read. Choose it again.');
    checkEntities(bytes, (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory);
    try {
      loaded = await loadModel(bytes);
    } catch (e) { keeper.forget(); throw e; }
    keeper.keep(req.model, loaded);
  }
  try {
    const result = await runValidation({
      ids: req.ids, idsName: req.idsName, ifcBytes: new ArrayBuffer(0), ifcName: req.model.name,
      loaded, onPhase: req.onPhase, onTick: req.onTick, spill: req.spill,
    });
    // The time of this run: with the reading of the model when it was read, without it when the kept copy was used.
    return { result: { ...result, seconds: (performance.now() - t0) / 1000 }, reused };
  } catch (e) {
    // Whatever went wrong, the next run starts from the file, not from this copy.
    if (!(e instanceof RunStopped)) keeper.forget();
    throw e;
  }
}
