/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The time a check is allowed starts once the engine is loaded, so a download of the engine that hung was waited for
// for ever: no verdict, no sentence, no "Check again". Here the engine never arrives: the download has a time of its
// own, longer than a check of a small file is allowed, and then the page says so and offers "Check again".
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A download of the engine that never ends.
vi.mock('@idsbench/check', () => new Promise(() => {}));

const { CHECK_ALLOWED_MS, ENGINE_LOAD_ALLOWED_MS, ENGINE_NOT_LOADED, EngineNotLoaded, checkText, startCheck } = await import('../src/core/checkview');
const { TitleBlock } = await import('../src/ui/page/TitleBlock');
const { idsText, specXml } = await import('./helpers/small-model');

const xml = idsText(specXml('Walls', 'IFCWALL'));
afterEach(() => { vi.useRealTimers(); });

describe('a download of the engine that does not end', () => {
  it('is given up after a time of its own, longer than a check is allowed, with a sentence that says so', async () => {
    expect(ENGINE_LOAD_ALLOWED_MS).toBeGreaterThan(CHECK_ALLOWED_MS);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let settled: unknown = 'pending';
    const p = checkText(xml).then((v) => { settled = v; }, (e) => { settled = e; });
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_ALLOWED_MS - 1);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(settled).toBeInstanceOf(EngineNotLoaded);
    expect((settled as Error).message).toBe(ENGINE_NOT_LOADED);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is kept by the page as the check\'s sentence, shown with "Check again" and no verdict', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const done = vi.fn();
    startCheck(xml, done);
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_ALLOWED_MS + 1);
    expect(done).toHaveBeenCalledWith({ text: xml, failed: ENGINE_NOT_LOADED });
    const page = { report: null, check: { text: xml, failed: ENGINE_NOT_LOADED }, run: null, model: null, name: 'a.ids', dirty: false, blank: false, doc: null, lines: null, checkAgain: () => {} };
    const html = renderToStaticMarkup(createElement(TitleBlock, { page: page as never, shown: true }));
    expect(html).toContain(ENGINE_NOT_LOADED);
    expect(html).toMatch(/<button[^>]*>Check again<\/button>/);
  });

  it('a check stopped while the engine downloads says nothing and leaves no timer behind', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const done = vi.fn();
    const stop = startCheck(xml, done);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_ALLOWED_MS + 1);
    expect(done).not.toHaveBeenCalled();
  });
});
