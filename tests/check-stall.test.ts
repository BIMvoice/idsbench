/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The Check engine validates against the schema in a Worker of its own (xmllint-wasm starts one for each check). A
// worker that the browser ends without an error event never answers, and the page said "Checking the IDS file..." for
// ever, with nothing to press; a run waited the same way, before its own worker (which is watched) was even asked.
// Here the schema validator is replaced by one whose worker never answers: the check gives up after the time it is
// allowed, says so in a sentence, and the page offers to check again.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dead = vi.hoisted(() => ({ on: true, calls: 0 }));
vi.mock('xmllint-wasm', async (original) => {
  const real = await original<typeof import('xmllint-wasm')>();
  return {
    ...real,
    // A worker that was started and then ended without a word: no message, no error, the promise never settles.
    validateXML: (o: Parameters<typeof real.validateXML>[0]) => { dead.calls++; return dead.on ? new Promise(() => {}) : real.validateXML(o); },
  };
});

// Loaded before the clock is faked, so that loading it is not what the fake clock waits for.
await import('@idsbench/check');
const { CHECK_STALLED, CheckStalled, checkAllowed, checkText } = await import('../src/core/checkview');
const { prepareIds } = await import('../src/core/prepare');
const { TitleBlock } = await import('../src/ui/page/TitleBlock');
const { idsText, specXml } = await import('./helpers/small-model');

const xml = idsText(specXml('Walls', 'IFCWALL'));
afterEach(() => { vi.useRealTimers(); dead.on = true; });

describe('a check whose worker never answers', () => {
  it('gives up after the time it is allowed, with a sentence that says what to do', async () => {
    vi.useFakeTimers();
    const before = dead.calls;
    let settled: unknown = 'pending';
    const p = checkText(xml).then((v) => { settled = v; }, (e) => { settled = e; });
    await vi.advanceTimersByTimeAsync(checkAllowed(xml.length) - 1);
    expect(dead.calls).toBe(before + 1);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(settled).toBeInstanceOf(CheckStalled);
    expect((settled as Error).message).toBe(CHECK_STALLED);
    expect((settled as InstanceType<typeof CheckStalled>).kind).toBe('check-stalled');
  });
  it('the run is refused the same way, so it does not wait for ever either', async () => {
    vi.useFakeTimers();
    let settled: unknown = 'pending';
    const p = prepareIds(xml).then((v) => { settled = v; }, (e) => { settled = e; });
    await vi.advanceTimersByTimeAsync(checkAllowed(xml.length) + 1);
    await p;
    expect(settled).toBeInstanceOf(CheckStalled);
  });
  it('a check that answers in time is not touched, and leaves no timer behind', async () => {
    dead.on = false;
    const view = await checkText(xml);
    expect(view).toMatchObject({ kind: 'report', valid: true });
  });
  it('is allowed half a minute, and longer for a large file: 3 s a megabyte, about ten times what one was measured to take', () => {
    const MB = 1024 * 1024;
    expect(checkAllowed(0)).toBe(30_000);
    expect(checkAllowed(10_000)).toBe(30_029);
    // 63.5 MB of IDS was checked in 17.2 s in Node on the computer this was written on.
    expect(checkAllowed(63.5 * MB)).toBeGreaterThan(10 * 17_200);
    expect(checkAllowed(100 * MB)).toBe(30_000 + 300_000);
  });
});

describe('the page after a check that did not answer', () => {
  const page = (checkAgain: () => void) => ({
    report: null, check: { text: xml, failed: CHECK_STALLED }, run: null, model: null, name: 'a.ids', dirty: false, blank: false, doc: null, lines: null, checkAgain,
  });
  it('says so and offers "Check again", which asks for a new check', () => {
    const again = vi.fn();
    const html = renderToStaticMarkup(createElement(TitleBlock, { page: page(again) as never, shown: true }));
    expect(html).toContain(CHECK_STALLED);
    expect(html).toMatch(/<button[^>]*>Check again<\/button>/);
    expect(html).not.toContain('Checking the IDS file...');
  });
});
