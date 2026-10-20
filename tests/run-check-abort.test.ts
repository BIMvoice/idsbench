/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A run checks the IDS file first (prepareIds), and that check had no way to be stopped: cancelling the run stopped
// listening to it, but its schema validator went on. Editing the document during a run that re-checks it left two
// validators alive, the cancelled run's and the new one's. Here the browser build of xmllint-wasm runs as in the page,
// with a Worker that never answers in place of the browser's: cancelling a run ends its validator.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workers = vi.hoisted(() => {
  /** A Worker that takes the message and never answers, as a validator still at work on a large file. */
  class SlowWorker extends EventTarget {
    static made: SlowWorker[] = [];
    terminated = false;
    constructor(readonly url: unknown) { super(); SlowWorker.made.push(this); }
    postMessage(): void {}
    terminate(): void { this.terminated = true; }
  }
  return { SlowWorker, live: () => SlowWorker.made.filter((w) => !w.terminated).length };
});
const browserBuild = vi.hoisted((): string => 'xmllint-wasm/index-browser.mjs');
vi.mock('xmllint-wasm', () => import(browserBuild));

await import('@idsbench/check');
const { runInWorker, RunCancelled } = await import('../src/runner');
const { idsText, ifcText, line, specXml } = await import('./helpers/small-model');

const { SlowWorker } = workers;
beforeEach(() => { SlowWorker.made = []; vi.stubGlobal('Worker', SlowWorker); });
afterEach(() => { vi.unstubAllGlobals(); });

const ids = (n: number) => new File([idsText(specXml(`Walls ${n}`, 'IFCWALL'))], 'a.ids');
const ifc = new File([ifcText(line(1, 'IFCWALL', 'W'))], 'm.ifc');
/** Waits until `n` validators have been started. */
const started = (n: number) => vi.waitFor(() => { if (SlowWorker.made.length < n) throw new Error('not yet'); });

describe('the check of the IDS file a run makes first', () => {
  it('is ended when the run is cancelled, and the run says only that it was cancelled', async () => {
    const run = runInWorker({ ids: ids(0), ifc }, () => {});
    const settled = run.promise.then(() => 'done', (e: unknown) => e);
    await started(1);
    expect(workers.live()).toBe(1);
    run.cancel();
    expect(await settled).toBeInstanceOf(RunCancelled);
    expect(workers.live()).toBe(0);
  });

  it('of a run replaced by a newer one (an edit during the run) never goes on beside the newer one', async () => {
    let run = runInWorker({ ids: ids(0), ifc }, () => {});
    for (let i = 1; i <= 3; i++) {
      run.promise.catch(() => {});
      await started(i);
      // What the page does when the document changes during a run: the old run is cancelled, a new one starts.
      run.cancel();
      run = runInWorker({ ids: ids(i), ifc }, () => {});
    }
    run.promise.catch(() => {});
    await started(4);
    expect(workers.live()).toBe(1);
    run.cancel();
    expect(workers.live()).toBe(0);
  });
});
