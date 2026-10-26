/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The shapes for 3D are made by the worker one request after another, and a pass over a large model takes tens of
// seconds. Opening 3D and closing it again must not leave that pass queued in front of the next check: the request is
// cancelled, and the worker is told.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const made = vi.hoisted(() => {
  class FakeWorker extends EventTarget {
    static all: FakeWorker[] = [];
    sent: Record<string, unknown>[] = [];
    constructor() { super(); FakeWorker.all.push(this); }
    postMessage(m: Record<string, unknown>): void { this.sent.push(m); }
    terminate(): void {}
  }
  return { FakeWorker };
});
// The check of the IDS file is not what is tested here: it answers at once, so the page's worker is started.
vi.mock('../src/core/prepare', () => ({ prepareIds: async () => ({ doc: { specifications: [] }, warnings: 0 }), IdsInvalid: class extends Error {} }));
vi.mock('../src/core/sentences', () => ({ sentencesFor: async () => null }));

const { runInWorker, loadScene, stopWorker } = await import('../src/runner');
const { idsText, ifcText, line, specXml } = await import('./helpers/small-model');

const { FakeWorker } = made;
beforeEach(() => { FakeWorker.all = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { stopWorker(); vi.unstubAllGlobals(); });

describe('a request for the shapes of the model', () => {
  it('can be cancelled, which tells the worker so that it does not make them', async () => {
    const ifc = new File([ifcText(line(1, 'IFCWALL', 'W'))], 'm.ifc');
    const run = runInWorker({ ids: new File([idsText(specXml('Walls', 'IFCWALL'))], 'a.ids'), ifc }, () => {});
    run.promise.catch(() => {});
    await vi.waitFor(() => { if (!FakeWorker.all[0]?.sent.some((m) => m.type === 'run')) throw new Error('not yet'); });
    const scene = loadScene(ifc);
    scene.promise.catch(() => {});
    const asked = FakeWorker.all[0].sent.find((m) => m.type === 'scene')!;
    expect(asked).toBeTruthy();
    scene.cancel();
    expect(FakeWorker.all[0].sent.filter((m) => m.type === 'cancel' && m.id === asked.id)).toHaveLength(1);
    await expect(scene.promise).rejects.toThrow();
    // Cancelled twice, or after it settled: nothing more is sent.
    scene.cancel();
    expect(FakeWorker.all[0].sent.filter((m) => m.type === 'cancel' && m.id === asked.id)).toHaveLength(1);
  });
});
