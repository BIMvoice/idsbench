/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A download of the engine that failed said "Check again", and Check again could never work: Chromium keeps the failed
// import() of a module, so a 503 and then a 200 still failed, with one request to the server. Importing it again under
// another address would not help either: the engine imports chunks of its own by their fixed addresses, and in headless
// Chromium 153 an entry imported again under a new query still failed, with no new request, when it was a chunk it
// imports that had failed. Only a new page loads it afresh: the sentence says to reload the page (the draft is
// kept across a reload).
import { afterEach, describe, expect, it, vi } from 'vitest';

// A download of the engine that fails.
vi.mock('@idsbench/check', () => { throw new TypeError('Failed to fetch dynamically imported module'); });

const { ENGINE_NOT_LOADED, EngineNotLoaded, checkText } = await import('../src/core/checkview');
const { idsText, specXml } = await import('./helpers/small-model');

afterEach(() => { vi.restoreAllMocks(); });

describe('a download of the engine that failed', () => {
  it('says so, and tells the user to reload the page, not to Check again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await checkText(idsText(specXml('Walls', 'IFCWALL'))).then(() => null, (e: unknown) => e);
    expect(failed).toBeInstanceOf(EngineNotLoaded);
    expect((failed as Error).message).toBe(ENGINE_NOT_LOADED);
    expect(ENGINE_NOT_LOADED).toMatch(/reload the page/);
    expect(ENGINE_NOT_LOADED).not.toMatch(/Check again/);
  });
});
