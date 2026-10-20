/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// How many matching elements a specification allows. IDS 1.0 knows three choices (developer guide, "Optionality":
// minOccurs 1 / maxOccurs unbounded, 0 / unbounded, 0 / 0; "Other configurations of minOccurs and maxOccurs are
// currently not allowed"). For any other number the library and IfcTester disagree: the library fails "at most 2" when
// there are 3, IfcTester reads only whether minOccurs is 0 and whether maxOccurs is 0 (ifctester/ids.py,
// Specification.check_status), so it passes the same model. Neither is the standard, so such a file gets no verdict:
// Check reports it and Run gives no result for it, even when its engine is called directly.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkText } from '../src/core/checkview';
import { prepareIds, IdsInvalid } from '../src/core/prepare';
import { plainFinding } from '../src/core/plain';
import { idsText, ifcText, line, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const walls = ifcText(line(1, 'IFCWALL', 'Waldo') + line(2, 'IFCWALL', 'Waldo') + line(3, 'IFCWALL', 'Waldo'));
const atMostTwo = specXml('At most two walls', 'IFCWALL', 'minOccurs="1" maxOccurs="2"', nameIs('Waldo'));
const atLeastFour = specXml('At least four walls', 'IFCWALL', 'minOccurs="4" maxOccurs="unbounded"', nameIs('Waldo'));
const exactlyThree = specXml('Exactly three walls', 'IFCWALL', 'minOccurs="3" maxOccurs="3"', nameIs('Waldo'));
const required = specXml('Walls are named Waldo', 'IFCWALL', undefined, nameIs('Waldo'));

describe('a number of matching elements that IDS 1.0 does not allow', () => {
  it('is a problem the Check verdict reports, in plain words, at the specification', async () => {
    for (const s of [atMostTwo, atLeastFour, exactlyThree]) {
      const view = await checkText(idsText(s));
      expect(view.kind).toBe('report');
      if (view.kind !== 'report') continue;
      expect(view.valid).toBe(false);
      const f = view.findings.find((x) => x.code === 'cardinality-invalid');
      expect(f, s).toBeDefined();
      expect(plainFinding(f!).plain).toBe('IDS allows only three choices for how many matching elements there may be: at least one, any number including none, or none. Choose one of them.');
    }
  });
  it('is never run from the page: Run refuses the file', async () => {
    for (const s of [atMostTwo, atLeastFour, exactlyThree]) await expect(prepareIds(idsText(s))).rejects.toBeInstanceOf(IdsInvalid);
  });
  it('gets no verdict from the run engine either, where the library and IfcTester would give two different ones', async () => {
    const r = await runText(idsText(required, atMostTwo, atLeastFour, exactlyThree), walls);
    expect(r.specs.map((s) => [s.name, s.state])).toEqual([
      ['Walls are named Waldo', 'pass'],
      ['At most two walls', 'unchecked'],
      ['At least four walls', 'unchecked'],
      ['Exactly three walls', 'unchecked'],
    ]);
    for (const s of r.specs.slice(1)) {
      expect(s.note).toBe('This specification was not checked: it allows a number of matching elements that IDS 1.0 does not have. IDS allows only three choices: at least one, any number including none, or none. Choose one of them in the IDS file.');
      expect(s.wholeFailure).toBeUndefined();
      expect(s.failureTotal).toBe(0);
    }
    expect(r.verdict).toBe('incomplete');
  });
  it('the three choices IDS allows are run as before', async () => {
    const r = await runText(idsText(
      required,
      specXml('Walls may be there', 'IFCWALL', 'minOccurs="0" maxOccurs="unbounded"', nameIs('Waldo')),
      specXml('No walls', 'IFCWALL', 'minOccurs="0" maxOccurs="0"'),
    ), walls);
    expect(r.specs.map((s) => s.state)).toEqual(['pass', 'pass', 'fail']);
  });
});
