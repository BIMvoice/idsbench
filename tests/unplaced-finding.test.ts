/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// In a file written on one line, the schema check's findings all said line 1, and the page put every one of them under
// the first specification. A finding the engine cannot place is now shown about the file, with the sentence that says
// why, and never under a specification it is not about.
import { describe, expect, it } from 'vitest';
import { checkText } from '../src/core/checkview';
import { outline, placeFindings } from '../src/core/place';
import { plainFinding } from '../src/core/plain';
import { idsText, specXml } from './helpers/small-model';

describe('a schema finding in a file written on one line', () => {
  it('is shown about the file with why, not under the first specification', async () => {
    const xml = idsText(specXml('A', 'IFCWALL'), specXml('B', 'IFCWALL'), specXml('C', 'IFCWALL', undefined, '', 'IFC9'));
    expect(xml).not.toContain('\n');
    const view = await checkText(xml);
    if (view.kind !== 'report') throw new Error(view.text);
    const schema = view.findings.find((f) => f.code === 'xsd-invalid-value')!;
    const placed = placeFindings(view.findings, outline(xml));
    expect(placed.file).toContain(schema);
    expect(placed.specs.get(0) ?? []).not.toContain(schema);
    expect(plainFinding(schema).plain).toMatch(/IFC9.*The schema check gives only the line, and line 1 holds more than one <specification>, so which one it is cannot be said\.$/);
    // The rules of the engine still place their own finding on the specification it is about.
    expect(placed.specs.get(2)?.map((f) => f.code)).toContain('ifc-version-invalid');
  });
});
