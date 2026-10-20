/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// xmllint-wasm starts a Worker for each validation and ends it only when the validation settles. A check that was
// given up on (its time ran out) or no longer wanted (the text changed, "Check again", the page went) stopped being
// listened to, but its Worker went on working and holding memory beside the next check's. Here the browser build of
// xmllint-wasm runs as it does in the page, with a Worker that never answers in place of the browser's: the Worker is
// ended when the time runs out and when the check is stopped, and a new check never runs beside an old one.
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
// The build the page uses (package.json "browser"): it takes its Worker from the global scope. (Named through a
// string: the package declares types for its main entry only.)
const browserBuild = vi.hoisted((): string => 'xmllint-wasm/index-browser.mjs');
vi.mock('xmllint-wasm', () => import(browserBuild));

// Loaded before the clock is faked, so that loading it is not what the fake clock waits for.
await import('@idsbench/check');
const { CheckStalled, checkAllowed, checkText, startCheck } = await import('../src/core/checkview');
const { idsText, specXml } = await import('./helpers/small-model');

const xml = idsText(specXml('Walls', 'IFCWALL'));
const { SlowWorker } = workers;
beforeEach(() => { SlowWorker.made = []; vi.stubGlobal('Worker', SlowWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** Lets the engine run up to the point where it waits for its validator. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('the schema validator of a check', () => {
  it('is ended when the time the check is allowed runs out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let settled: unknown = 'pending';
    const p = checkText(xml).then((v) => { settled = v; }, (e) => { settled = e; });
    await settle();
    expect(SlowWorker.made).toHaveLength(1);
    expect(workers.live()).toBe(1);
    await vi.advanceTimersByTimeAsync(checkAllowed(xml.length) + 1);
    await p;
    expect(settled).toBeInstanceOf(CheckStalled);
    expect(SlowWorker.made[0].terminated).toBe(true);
  });

  it('is ended at once when the check is stopped, and the check says nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const done = vi.fn();
    const stop = startCheck(xml, done);
    await settle();
    expect(workers.live()).toBe(1);
    stop();
    await settle();
    expect(SlowWorker.made[0].terminated).toBe(true);
    // The time allowed passing afterwards changes nothing: nothing is handed on, and no timer is left behind.
    await vi.advanceTimersByTimeAsync(checkAllowed(xml.length) + 1);
    expect(done).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('of a check replaced by a newer one (an edit, or "Check again") never runs beside the newer one', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let stop = startCheck(xml, () => {});
    for (let i = 0; i < 5; i++) {
      await settle();
      expect(workers.live()).toBe(1);
      // What the page does when the text changes: the effect of the old text is cleaned up, the new one starts.
      stop();
      stop = startCheck(`${xml}\n<!-- ${i} -->`, () => {});
    }
    await settle();
    expect(SlowWorker.made).toHaveLength(6);
    expect(workers.live()).toBe(1);
    stop();
    await settle();
    expect(workers.live()).toBe(0);
  });

  it('a check stopped before it began starts no validator at all', async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(checkText(xml, { signal: stop.signal })).rejects.toThrow();
    expect(SlowWorker.made).toHaveLength(0);
  });

  it('the global Worker is the browser\'s again once the validator has started', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const stop = startCheck(xml, () => {});
    await settle();
    expect(globalThis.Worker).toBe(SlowWorker);
    expect(SlowWorker.made[0]).toBeInstanceOf(SlowWorker);
    stop();
  });
});
