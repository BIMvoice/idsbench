/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A file the forms cannot read is checked by the engine when it is opened, and that check had no way to be stopped:
// opening a second file, or leaving the page, stopped listening to it, but its schema validator went on. Here the
// page's own state (usePage) runs with a minimal stand-in for React's hooks, and the browser build of xmllint-wasm with
// a Worker that never answers in place of the browser's: the first file's validator is ended in both cases.
import { DOMParser } from '@xmldom/xmldom';
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

/** One render of a hook: state is its first value, effects run once in order, and `unmount` runs their cleanups. */
const hooks = vi.hoisted(() => {
  let effects: (() => void | (() => void))[] = [];
  return {
    take: () => { const e = effects; effects = []; return e; },
    react: {
      useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
      useRef: (v: unknown) => ({ current: v }),
      useMemo: (f: () => unknown) => f(),
      useCallback: (f: unknown) => f,
      useEffect: (f: () => void | (() => void)) => { effects.push(f); },
    },
  };
});
vi.mock('react', () => ({ ...hooks.react, default: hooks.react }));

await import('@idsbench/check');
const { usePage } = await import('../src/ui/page/usePage');

// Not readable by the forms (a specification with no name), so the page asks the engine.
const NS = 'http://standards.buildingsmart.org/IDS';
const ids = (title: string) => new File([`<ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd"><info><title>${title}</title></info><specifications><specification ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability></specification></specifications></ids>`], `${title}.ids`);

const { SlowWorker } = workers;
beforeEach(() => {
  SlowWorker.made = [];
  vi.stubGlobal('Worker', SlowWorker);
  vi.stubGlobal('DOMParser', DOMParser);
  vi.stubGlobal('window', { confirm: () => true, addEventListener() {}, removeEventListener() {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount() {
  const page = usePage();
  const cleanups = hooks.take().map((f) => f()).filter((c): c is () => void => typeof c === 'function');
  return { page, unmount: () => cleanups.forEach((c) => c()) };
}
const started = (n: number) => vi.waitFor(() => { if (SlowWorker.made.length < n) throw new Error('not yet'); });

describe('the check of a file being opened', () => {
  it('is ended when a second file is opened', async () => {
    const { page, unmount } = mount();
    void page.openIds(ids('first'));
    await started(1);
    void page.openIds(ids('second'));
    await started(2);
    expect(SlowWorker.made[0].terminated).toBe(true);
    expect(workers.live()).toBe(1);
    unmount();
  });

  it('is ended when the page goes', async () => {
    const { page, unmount } = mount();
    const opened = page.openIds(ids('first'));
    await started(1);
    expect(workers.live()).toBe(1);
    unmount();
    await opened;
    expect(workers.live()).toBe(0);
    // A file whose opening was given up on says nothing, not "Something went wrong".
    expect(console.error).not.toHaveBeenCalled();
  });
});
