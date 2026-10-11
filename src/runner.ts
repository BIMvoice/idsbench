import type { Phase } from './core/validate';
import { prepareIds, IdsInvalid } from './core/prepare';
import { AppError, FILE_UNREADABLE, UNEXPECTED } from './core/errors';
import type { AppErrorInfo, RunResult } from './core/types';
import type { WorkerMessage } from './worker';

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
}

export interface Run {
  promise: Promise<RunOutcome>;
  /** Stop the worker and settle the promise with RunCancelled. Safe to call at any time. */
  cancel: () => void;
}

/** Run the check in a Web Worker so the page stays responsive. */
export function runInWorker(files: { ids: File; ifc: File }, onPhase: (p: Phase) => void): Run {
  let worker: Worker | null = null;
  let cancelled = false;
  let rejectRun: (e: Error) => void = () => {};
  const cancel = () => {
    cancelled = true;
    worker?.terminate();
    worker = null;
    rejectRun(new RunCancelled());
  };

  const promise = new Promise<RunOutcome>((resolve, reject) => {
    rejectRun = reject;
    void (async () => {
      let idsXml: string;
      let ifcBytes: ArrayBuffer;
      try {
        [idsXml, ifcBytes] = await Promise.all([files.ids.text(), files.ifc.arrayBuffer()]);
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
      const fail = (detail: unknown) => {
        console.error(detail);
        worker?.terminate();
        worker = null;
        reject(new RunFailed({ kind: 'unexpected', message: UNEXPECTED }));
      };
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
          const m = ev.data;
          if (cancelled) return;
          if (m.type === 'phase') { onPhase(m.phase); return; }
          worker?.terminate();
          worker = null;
          if (m.type === 'done') resolve({ result: m.result, idsWarnings });
          else reject(new RunFailed(m.error));
        };
        // A worker that crashes (for example when the browser cannot give it
        // more memory) reports here, not through a message.
        worker.onerror = (ev) => { ev.preventDefault?.(); fail(ev); };
        worker.onmessageerror = fail;
        worker.postMessage({ ids, idsName: files.ids.name, ifcBytes, ifcName: files.ifc.name }, [ifcBytes]);
      } catch (e) {
        fail(e);
      }
    })();
  });
  return { promise, cancel };
}
