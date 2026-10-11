import { runValidation, type Phase } from './core/validate';
import { mapError } from './core/errors';
import type { IDSDocument } from '@ifc-lite/ids';
import type { AppErrorInfo, RunResult } from './core/types';

export type WorkerRequest = { ids: IDSDocument; idsName: string; ifcBytes: ArrayBuffer; ifcName: string };
export type WorkerMessage =
  | { type: 'phase'; phase: Phase }
  | { type: 'done'; result: RunResult }
  | { type: 'error'; error: AppErrorInfo };

const post = (m: WorkerMessage) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  try {
    const result = await runValidation({ ...ev.data, onPhase: (phase) => post({ type: 'phase', phase }) });
    post({ type: 'done', result });
  } catch (e) {
    console.error(e);
    post({ type: 'error', error: mapError(e, 'validate') });
  }
};
