/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A file the forms cannot read is shown with what the engine says of it. When that check did not answer, opening the
// file fell into the catch-all: "Something went wrong", the file not shown, nothing to press. Here what the page keeps
// for such a file is the check's own sentence, so the file is shown with it and with "Check again"; only what is not an
// AppError is still unexpected.
import { afterEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({ mode: 'dead' as 'dead' | 'broken' | 'real' }));
vi.mock('xmllint-wasm', async (original) => {
  const real = await original<typeof import('xmllint-wasm')>();
  return {
    ...real,
    validateXML: (o: Parameters<typeof real.validateXML>[0]) =>
      engine.mode === 'dead' ? new Promise(() => {}) : engine.mode === 'broken' ? Promise.resolve({ rawOutput: undefined }) /* a fault of the page's own code downstream, not of the validator */ : real.validateXML(o),
  };
});

// Loaded before the clock is faked, so that loading it is not what the fake clock waits for.
await import('@idsbench/check');
const { CHECK_STALLED, checkAllowed, checkForOpening } = await import('../src/core/checkview');

// Not readable by the forms (no specifications element), so the page asks the engine.
const NS = 'http://standards.buildingsmart.org/IDS';
const xml = `<ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd"><info><title>t</title></info></ids>`;
afterEach(() => { vi.useRealTimers(); engine.mode = 'dead'; });

describe('opening a file the forms cannot read', () => {
  it('when the check does not answer, keeps its sentence for the page, which offers "Check again"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let settled: unknown = 'pending';
    const p = checkForOpening(xml).then((v) => { settled = v; }, (e) => { settled = e; });
    await vi.advanceTimersByTimeAsync(checkAllowed(xml.length) + 1);
    await p;
    expect(settled).toEqual({ text: xml, failed: CHECK_STALLED });
  });
  it('when the check answers, keeps its answer', async () => {
    engine.mode = 'real';
    const c = await checkForOpening(xml);
    expect(c).toMatchObject({ text: xml, view: { kind: 'report', valid: false } });
  });
  it('anything else is still thrown, and said as unexpected by the page', async () => {
    engine.mode = 'broken';
    await expect(checkForOpening(xml)).rejects.toBeInstanceOf(TypeError);
  });
});
