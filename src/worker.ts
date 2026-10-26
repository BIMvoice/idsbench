/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The worker: reads the model, keeps it between runs, checks it against the IDS, and tells the page that it is alive.
import { mapError } from './core/errors';
import { keeperFor, ModelKeeper, runSession, type ModelBytes, type ModelRef } from './core/session';
import { RunStopped, type Phase } from './core/validate';
import type { IDSDocument } from '@ifc-lite/ids';
import { buildScene, SCENE_MAX_BYTES, SCENE_TOO_BIG, SceneTooLarge, type Scene } from './core/scene';
import type { AppErrorInfo, RunResult } from './core/types';

export type WorkerRequest =
  /**
   * `slot` 'earlier' is the earlier delivery a comparison is made with: it is read and kept apart from the page's model,
   * so that neither pushes the other out. `collect` asks for what a comparison needs (RunResult.keys).
   */
  | { type: 'run'; id: number; ids: IDSDocument; idsName: string; model: ModelRef; file: File; fresh: boolean; sentences: string[] | null; slot?: Slot; collect?: boolean }
  | { type: 'cancel'; id: number }
  /** The shapes of the page's model for the 3D view (see core/scene.ts). The model must be the one the worker holds. */
  | { type: 'scene'; id: number; model: ModelRef; file: File }
  /** The page no longer needs the model the worker holds in `slot` (the page's model when absent), unless it is the one of file `except`: let go of its memory. */
  | { type: 'forget'; except: number | null; slot?: Slot };
/** Which model a run is of: the page's model, or the earlier delivery it is compared with. */
export type Slot = 'model' | 'earlier';
export type WorkerMessage =
  | { type: 'alive'; lock: string | null }
  | { type: 'beat' }
  | { type: 'phase'; id: number; phase: Phase }
  | { type: 'done'; id: number; result: RunResult; reused: boolean; model: ModelBytes }
  | { type: 'cancelled'; id: number }
  | { type: 'scene-done'; id: number; scene: Scene }
  | { type: 'scene-error'; id: number; message: string }
  | { type: 'error'; id: number; error: AppErrorInfo };

const post = (m: WorkerMessage) => (self as unknown as Worker).postMessage(m);
const keeper = new ModelKeeper();
/** The earlier delivery of a comparison, kept apart from the page's model. */
const earlierKeeper = new ModelKeeper();
const cancelled = new Set<number>();
let queue: Promise<void> = Promise.resolve();

// The page is told that this worker is running: every second by a timer, and from inside the long steps themselves
// (the count of the entities, the parsing, the check), because a timer does not get a turn while the parser works: it
// hands the thread back in a way that lets it go on before any timer. And while this worker lives it holds a lock that
// the page waits for: when the browser ends the worker without a word, the lock is let go and the page knows at once.
let lastBeat = 0;
const beat = () => {
  const now = Date.now();
  if (now - lastBeat < 250) return;
  lastBeat = now;
  post({ type: 'beat' });
};
setInterval(beat, 1000);
const lock = `idsbench-worker-${Math.random().toString(36).slice(2)}`;
if (typeof navigator !== 'undefined' && navigator.locks) {
  void navigator.locks.request(lock, () => { post({ type: 'alive', lock }); return new Promise<void>(() => {}); });
} else {
  post({ type: 'alive', lock: null });
}

async function run(m: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  if (cancelled.delete(m.id)) { post({ type: 'cancelled', id: m.id }); return; }
  try {
    // The two models of a comparison are held against one budget (see keeperFor).
    const chosen = keeperFor(m.slot, { model: keeper, earlier: earlierKeeper }, m.model, m.fresh);
    const { result, reused, model } = await runSession(chosen.keeper, {
      held: chosen.held,
      ids: m.ids,
      idsName: m.idsName,
      model: m.model,
      read: () => m.file.arrayBuffer(),
      fresh: m.fresh,
      spill: true,
      sentences: m.sentences,
      collect: m.collect === true,
      onPhase: (phase) => post({ type: 'phase', id: m.id, phase }),
      onTick: () => { beat(); if (cancelled.has(m.id)) throw new RunStopped(); },
    });
    cancelled.delete(m.id);
    post({ type: 'done', id: m.id, result, reused, model });
  } catch (e) {
    if (e instanceof RunStopped) { cancelled.delete(m.id); post({ type: 'cancelled', id: m.id }); return; }
    console.error(e);
    post({ type: 'error', id: m.id, error: mapError(e, 'validate') });
  }
}

async function scene(m: Extract<WorkerRequest, { type: 'scene' }>): Promise<void> {
  // Cancelled while it waited its turn (3D was closed): nothing is made.
  if (cancelled.delete(m.id)) return;
  try {
    const loaded = keeper.get(m.model);
    if (!loaded) { post({ type: 'scene-error', id: m.id, message: 'The model is not held any more. Check it again, then open 3D.' }); return; }
    if (m.model.size > SCENE_MAX_BYTES) { post({ type: 'scene-error', id: m.id, message: SCENE_TOO_BIG(m.model.size) }); return; }
    const s = await buildScene(await m.file.arrayBuffer(), loaded, () => { beat(); if (cancelled.has(m.id)) throw new RunStopped(); });
    // The shapes are handed over, not copied.
    const transfer = s.meshes.flatMap((x) => [x.positions.buffer, x.normals.buffer, x.indices.buffer] as ArrayBuffer[]);
    (self as unknown as Worker).postMessage({ type: 'scene-done', id: m.id, scene: s } satisfies WorkerMessage, [...new Set(transfer)]);
  } catch (e) {
    if (e instanceof RunStopped) { cancelled.delete(m.id); return; }
    if (e instanceof SceneTooLarge) { post({ type: 'scene-error', id: m.id, message: e.message }); return; }
    console.error(e);
    post({ type: 'scene-error', id: m.id, message: 'The shapes of the model could not be made. The check is not affected.' });
  }
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  if (m.type === 'cancel') { cancelled.add(m.id); return; }
  if (m.type === 'scene') { queue = queue.then(() => scene(m)); return; }
  if (m.type === 'forget') { queue = queue.then(() => (m.slot === 'earlier' ? earlierKeeper : keeper).forgetOthers(m.except)); return; }
  // Runs go one after the other; a run asked for while another is going waits, and finds the model kept if it is the same.
  queue = queue.then(() => run(m));
};
