/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// libxml2 limits a text node to 10 MB unless it is told otherwise, and calls a file with a longer one not well-formed
// ("Resource limit exceeded"). The page reads IDS files of up to 100 MB: a valid file with a long description is valid.
import { describe, expect, it } from 'vitest';
import { checkIds } from '../src/index.ts';
import { entity, ids, spec } from './helpers.ts';

describe('a valid file with a text node over 10 MB', () => {
  it('is valid, not "not well-formed"', async () => {
    const long = 'A wall. '.repeat(1.5 * 1024 * 1024); // 12 MB
    const xml = ids(spec(entity())).replace('<title>Test</title>', `<title>Test</title><description>${long}</description>`);
    expect(long.length).toBeGreaterThan(10 * 1024 * 1024);
    const r = await checkIds(xml);
    expect(r.findings).toEqual([]);
    expect(r.valid).toBe(true);
  });
});
