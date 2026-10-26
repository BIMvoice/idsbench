/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The shapes of the model on the page, kept for as long as the 3D view is open. Editing the IDS file leaves the
// model as it is, and the view is rebuilt after every edit; making the shapes again each time is the costliest thing it
// could do. They are let go of when the view closes or the model changes.
import type { Scene } from './scene';

export interface Loading { promise: Promise<Scene>; cancel: () => void }

export class SceneKeeper {
  private held: { model: File; load: Loading } | null = null;
  constructor(private start: (model: File) => Loading) {}

  /** The shapes of `model`: the ones already made (or being made) for it, otherwise a new pass, which ends any pass for another model. */
  get(model: File): Promise<Scene> {
    if (this.held?.model === model) return this.held.load.promise;
    this.release();
    const load = this.start(model);
    // Nobody may be waiting when the pass is cancelled; that is not an error of the page.
    load.promise.catch(() => {});
    this.held = { model, load };
    return load.promise;
  }

  /** Give the shapes up: a pass in the worker is ended, and what was made is no longer held. */
  release(): void {
    this.held?.load.cancel();
    this.held = null;
  }
}
