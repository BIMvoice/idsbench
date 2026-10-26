/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The shapes of a model do not change when the IDS file is edited, and making them is the costliest step of the 3D view
// (22 s for 100,000 walls). They are made once for a model while 3D is open, and let go of when 3D closes or the model changes.
import { describe, expect, it, vi } from 'vitest';
import { SceneKeeper } from '../src/core/sceneKeeper';
import type { Scene } from '../src/core/scene';

const scene = (n: number): Scene => ({ meshes: [], guids: [[n, 'G']], triangles: n, ms: 0 });
const file = (name: string) => new File(['x'], name);
const loader = () => {
  const started: { model: File; cancel: ReturnType<typeof vi.fn>; resolve: (s: Scene) => void }[] = [];
  const start = (model: File) => {
    let resolve!: (s: Scene) => void;
    const promise = new Promise<Scene>((r) => { resolve = r; });
    const cancel = vi.fn();
    started.push({ model, cancel, resolve });
    return { promise, cancel };
  };
  return { started, start };
};

describe('the shapes kept for the model on the page', () => {
  it('are made once however often the view asks (an edit remounts the view, the model is the same)', async () => {
    const l = loader();
    const keeper = new SceneKeeper(l.start);
    const m = file('a.ifc');
    const first = keeper.get(m), again = keeper.get(m);
    l.started[0].resolve(scene(1));
    expect(await first).toBe(await again);
    expect(await keeper.get(m)).toBe(await first);
    expect(l.started).toHaveLength(1);
  });
  it('are given up when the view closes: a pass still running is cancelled and the next opening makes them again', () => {
    const l = loader();
    const keeper = new SceneKeeper(l.start);
    const m = file('a.ifc');
    void keeper.get(m);
    keeper.release();
    expect(l.started[0].cancel).toHaveBeenCalledTimes(1);
    void keeper.get(m);
    expect(l.started).toHaveLength(2);
  });
  it('are those of the model on the page: another model cancels the first one and is never answered with the first one\'s shapes', async () => {
    const l = loader();
    const keeper = new SceneKeeper(l.start);
    const a = file('a.ifc'), b = file('b.ifc');
    void keeper.get(a).catch(() => {});
    const forB = keeper.get(b);
    expect(l.started[0].cancel).toHaveBeenCalledTimes(1);
    l.started[1].resolve(scene(2));
    expect((await forB).triangles).toBe(2);
    expect(l.started).toHaveLength(2);
  });
});
