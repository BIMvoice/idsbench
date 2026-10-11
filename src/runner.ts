import type { Phase } from './core/validate';
import { prepareIds, IdsInvalid } from './core/prepare';
import { AppError, FILE_UNREADABLE, UNEXPECTED } from './core/errors';
import { checkSize } from './core/limits';
import type { AppErrorInfo, RunResult } from './core/types';
import type { ModelRef } from './core/session';
import type { WorkerMessage, WorkerRequest } from './worker';

export class RunFailed extends Error {
  info: AppErrorInfo;
  constructor(info: AppErrorInfo) {
    super(info.message);
    this.info = info;
  }
}

/** Thrown into the promise of a run that cancel() stopped. Never shown. */
export class RunCancelled extends Error {}

/** What a finished run hands back: the result, and how many warnings the Check engine raised on the IDS file. */
export interface RunOutcome {
  result: RunResult;
  idsWarnings: number;
  /** True when the model was not read again: the copy kept from the run before was checked. */
  modelReused: boolean;
}

export interface Run {
  promise: Promise<RunOutcome>;
  /** Stop waiting for this run and settle the promise with RunCancelled. The worker, and the model it has read, stay. Safe to call at any time. */
  cancel: () => void;
}

/** How long the worker may say nothing before the page offers to stop the run. It says something every second while it is not parsing. */
export const SILENCE_MS = 30_000;

export const WORKER_STOPPED =
  'The check was ended by the browser before it finished, most likely because the model needs more memory than the browser gives a tab. Close other tabs and programs and try again, or use a smaller model.';

// ---- the worker: one for the page, so that the model it has read is still there for the next run -----------------------
let worker: Worker | null = null;
let nextId = 1;
let nextToken = 1;
const tokens = new WeakMap<File, number>();
const tokenOf = (f: File): number => { let t = tokens.get(f); if (t === undefined) { t = nextToken++; tokens.set(f, t); } return t; };
const refOf = (f: File): ModelRef => ({ token: tokenOf(f), name: f.name, size: f.size, lastModified: f.lastModified });

interface Pending { id: number; onMessage: (m: WorkerMessage) => void; onDead: (why: 'error' | 'gone') => void }
let pending: Pending | null = null;
let heardAt = Date.now();
const listeners = new Set<(silent: boolean) => void>();
let silent = false;
const setSilent = (v: boolean) => { if (v !== silent) { silent = v; listeners.forEach((l) => l(v)); } };

function start(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  heardAt = Date.now();
  const hear = () => { heardAt = Date.now(); setSilent(false); };
  w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
    if (worker !== w) return;
    hear();
    const m = ev.data;
    if (m.type === 'alive') { watchLock(w, m.lock); return; }
    if (m.type === 'beat') return;
    if (pending && 'id' in m && m.id === pending.id) pending.onMessage(m);
  };
  // A worker that crashes (for example when the browser cannot give it more memory) may report here, not through a message.
  w.onerror = (ev) => { ev.preventDefault?.(); console.error(ev); died(w, 'error'); };
  w.onmessageerror = () => died(w, 'error');
  return w;
}

/** When the lock the worker holds is let go, the worker is gone, whether it said so or not. */
function watchLock(w: Worker, lock: string | null) {
  if (!lock || !navigator.locks) return;
  void navigator.locks.request(lock, () => { if (worker === w) died(w, 'gone'); });
}

/** The worker is gone: it reported an error ('error', the reason is not known) or its lock was let go with no word ('gone': the browser ended it, which is what running out of memory looks like). */
function died(w: Worker, why: 'error' | 'gone') {
  if (worker !== w) return;
  worker = null;
  w.terminate();
  setSilent(false);
  const p = pending;
  pending = null;
  p?.onDead(why);
}

/** End the worker (and the model it has read). Used by "Stop and try again". */
export function stopWorker(): void {
  const w = worker;
  worker = null;
  w?.terminate();
  setSilent(false);
  const p = pending;
  pending = null;
  p?.onDead('gone');
}

/** Tell the worker the model is no longer needed, so its memory is let go. */
export function forgetModel(): void {
  worker?.postMessage({ type: 'forget' } satisfies WorkerRequest);
}

/** Be told when the worker has said nothing for SILENCE_MS during a run, and when it speaks again. */
export function onSilence(listener: (silent: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const watchdog = setInterval(() => {
  if (pending && Date.now() - heardAt > SILENCE_MS) setSilent(true);
}, 1000);
// Not kept alive for tests that import this module in Node.
(watchdog as unknown as { unref?: () => void }).unref?.();

/** Run the check in a Web Worker so the page stays responsive. `fresh` reads the model again even if the worker holds a copy. */
export function runInWorker(files: { ids: File; ifc: File }, onPhase: (p: Phase) => void, options: { fresh?: boolean } = {}): Run {
  let cancelled = false;
  let myId = 0;
  let rejectRun: (e: Error) => void = () => {};
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (pending?.id === myId) { worker?.postMessage({ type: 'cancel', id: myId } satisfies WorkerRequest); pending = null; }
    rejectRun(new RunCancelled());
  };

  const promise = new Promise<RunOutcome>((resolve, reject) => {
    rejectRun = reject;
    void (async () => {
      // A model too large to open is refused before any of it is read.
      try { checkSize(files.ifc.size); } catch (e) {
        reject(new RunFailed({ kind: (e as AppError).kind, message: (e as AppError).message }));
        return;
      }
      let idsXml: string;
      try {
        idsXml = await files.ids.text();
      } catch (e) {
        // Only a failure to read the bytes is reported as an unreadable file.
        console.error(e);
        reject(new RunFailed({ kind: 'file-unreadable', message: FILE_UNREADABLE }));
        return;
      }
      if (cancelled) return;
      // The Check engine decides first: a file it rejects is never run.
      let ids, idsWarnings: number;
      try {
        ({ doc: ids, warnings: idsWarnings } = await prepareIds(idsXml));
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        reject(new RunFailed(
          e instanceof IdsInvalid ? { kind: e.kind, message: e.message, problems: e.problems }
            : e instanceof AppError ? { kind: e.kind, message: e.message }
            : { kind: 'unexpected', message: UNEXPECTED },
        ));
        return;
      }
      if (cancelled) return;
      try {
        worker ??= start();
        myId = nextId++;
        // Only one run is waited for at a time: an older one that was cancelled is answered into the void.
        pending = {
          id: myId,
          onMessage: (m) => {
            if (cancelled) return;
            if (m.type === 'phase') { onPhase(m.phase); return; }
            pending = null;
            if (m.type === 'done') resolve({ result: m.result, idsWarnings, modelReused: m.reused });
            else if (m.type === 'error') reject(new RunFailed(m.error));
            else reject(new RunCancelled());
          },
          onDead: (why) => { if (!cancelled) reject(new RunFailed(why === 'gone' ? { kind: 'worker-stopped', message: WORKER_STOPPED } : { kind: 'unexpected', message: UNEXPECTED })); },
        };
        heardAt = Date.now();
        worker.postMessage({ type: 'run', id: myId, ids, idsName: files.ids.name, model: refOf(files.ifc), file: files.ifc, fresh: options.fresh === true } satisfies WorkerRequest);
      } catch (e) {
        console.error(e);
        pending = null;
        reject(new RunFailed({ kind: 'unexpected', message: UNEXPECTED }));
      }
    })();
  });
  return { promise, cancel };
}
