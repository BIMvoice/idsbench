/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Names that come from files on someone's disk end up in the BCF file; none of them may make it invalid.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bcfBlob } from '../src/core/bcf';
import { readBcf } from './helpers/bcf';
import { idsText, ifcText, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const wall = `#1=IFCWALL('${'1'.padStart(22, '0')}',$,'Wilma',$,$,$,$,$,$);\n`;
const ids = idsText(specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo')));

describe('the name of the model in the BCF file', () => {
  it('is cleaned of characters XML cannot hold in the project name as it is everywhere else', async () => {
    const r = await runText(ids, ifcText(wall));
    r.ifcFile = 'a\u0001b\uD800 & <c>.ifc';
    const bcf = await readBcf(await bcfBlob(r));
    expect(bcf.invalid).toEqual([]);
  });
});
