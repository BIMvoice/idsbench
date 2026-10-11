import type { Phase } from './core/validate';
import { readIds } from './core/validate';
import { AppError } from './core/errors';
import type { AppErrorInfo, RunResult } from './core/types';
import type { WorkerMessage } from './worker';

export class RunFailed extends Error {
  info: AppErrorInfo;
  constructor(info: AppErrorInfo) {
    super(info.message);
    this.info = info;
  }
}

/** Run the check in a Web Worker so the page stays responsive. */
export function runInWorker(
  files: { ids: File; ifc: File },
  onPhase: (p: Phase) => void,
): Promise<RunResult> {
  return new Promise(async (resolve, reject) => {
    const unexpected = new RunFailed({
      kind: 'unexpected',
      message: 'Something went wrong while checking. The details are in the browser console.',
    });
    let ids;
    let ifcBytes: ArrayBuffer;
    try {
      onPhase('reading-ids');
      const [idsXml, bytes] = await Promise.all([files.ids.text(), files.ifc.arrayBuffer()]);
      ifcBytes = bytes;
      ids = readIds(idsXml);
    } catch (e) {
      if (e instanceof AppError) { reject(new RunFailed({ kind: e.kind, message: e.message })); return; }
      console.error(e);
      reject(new RunFailed({ kind: 'unexpected', message: 'One of the files could not be read from your computer.' }));
      return;
    }
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const m = ev.data;
      if (m.type === 'phase') onPhase(m.phase);
      else if (m.type === 'done') { done(); resolve(m.result); }
      else { done(); reject(new RunFailed(m.error)); }
    };
    worker.onerror = (ev) => { console.error(ev); done(); reject(unexpected); };
    worker.postMessage({ ids, idsName: files.ids.name, ifcBytes, ifcName: files.ifc.name }, [ifcBytes]);
  });
}
