/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The Check engine is loaded on first use. The time a check is allowed was counted from before it was loaded, so a
// slow download of the engine was taken out of the time of the check, and could even be called a check that did not
// answer. Here the engine takes far longer than the check is allowed to arrive: the check is not given up, and is
// allowed its full time from when the engine is there.
import { afterEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => {
  let arrive!: () => void;
  const arrived = new Promise<void>((r) => { arrive = r; });
  return { arrive, arrived };
});
vi.mock('@idsbench/check', async () => {
  await engine.arrived;
  return {
    // An engine that never answers: only the time allowed ends the check.
    checkIds: () => new Promise(() => {}),
    ValidatorFailed: class ValidatorFailed extends Error {},
  };
});

const { CheckStalled, checkAllowed, checkText } = await import('../src/core/checkview');
const { idsText, specXml } = await import('./helpers/small-model');

const xml = idsText(specXml('Walls', 'IFCWALL'));
afterEach(() => { vi.useRealTimers(); });

describe('the time a check is allowed', () => {
  it('is counted from when the engine has been loaded, not from before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let settled: unknown = 'pending';
    const p = checkText(xml).then((v) => { settled = v; }, (e) => { settled = e; });
    // The engine takes three times what the check is allowed to arrive.
    await vi.advanceTimersByTimeAsync(3 * checkAllowed(xml.length));
    expect(settled).toBe('pending');
    engine.arrive();
    await vi.advanceTimersByTimeAsync(checkAllowed(xml.length) - 1);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(settled).toBeInstanceOf(CheckStalled);
  });
});
