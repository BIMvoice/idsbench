/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// An element the standard does not know, inside "Applies to" or "Must have" (or in another namespace there). The library
// that runs the check skips it without a word, so a run of such a file would quietly check less than the file says.
// The official schema allows no unknown element anywhere in an IDS 1.0 file (it has no xs:any), so the Check verdict
// reports each one as a problem, at its line and at the specification it is in, and Run refuses the file.
import { describe, expect, it } from 'vitest';
import { checkText } from '../src/core/checkview';
import { outline, placeFindings } from '../src/core/place';
import { prepareIds, IdsInvalid } from '../src/core/prepare';
import { NS } from './helpers/small-model';

const file = (applicability: string, requirements: string) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} http://standards.buildingsmart.org/IDS/1.0/ids.xsd">`,
  '  <info><title>t</title></info>',
  '  <specifications>',
  '    <specification name="First" ifcVersion="IFC4">',
  '      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability>',
  '    </specification>',
  '    <specification name="Second" ifcVersion="IFC4">',
  '      <applicability minOccurs="1" maxOccurs="unbounded">',
  '        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>',
  `        ${applicability}`,
  '      </applicability>',
  '      <requirements>',
  `        ${requirements}`,
  '        <attribute cardinality="required"><name><simpleValue>Name</simpleValue></name></attribute>',
  '      </requirements>',
  '    </specification>',
  '  </specifications>',
  '</ids>', ''].join('\n');

const cases: [string, string, string, number][] = [
  ['an unknown element under "Must have"', '', '<colour><simpleValue>red</simpleValue></colour>', 14],
  ['an unknown element under "Applies to"', '<storey><simpleValue>L1</simpleValue></storey>', '', 11],
  ['an element of another namespace under "Must have"', '', '<x:extra xmlns:x="urn:example"/>', 14],
  ['a known element misspelt under "Must have"', '', '<atribute cardinality="required"><name><simpleValue>Tag</simpleValue></name></atribute>', 14],
];

describe('an element the standard does not know, inside a specification', () => {
  it.each(cases)('%s is a problem of the Check verdict, at its line and its specification', async (_, applicability, requirements, at) => {
    const text = file(applicability, requirements);
    const view = await checkText(text);
    expect(view.kind).toBe('report');
    if (view.kind !== 'report') return;
    expect(view.valid).toBe(false);
    const found = view.findings.filter((f) => f.code === 'xsd-unexpected-element');
    expect(found.map((f) => f.line)).toEqual([at]);
    expect(found[0].message).toMatch(/is not allowed here/);
    const placed = placeFindings(view.findings, outline(text));
    expect(placed.specs.get(1)?.map((f) => f.code)).toContain('xsd-unexpected-element');
    expect(placed.specs.get(0)).toBeUndefined();
  });
  it.each(cases)('%s: Run refuses the file, so nothing is checked without it', async (_, applicability, requirements) => {
    await expect(prepareIds(file(applicability, requirements))).rejects.toBeInstanceOf(IdsInvalid);
  });
  it('the same file without it is valid and runs', async () => {
    const view = await checkText(file('', ''));
    expect(view.kind === 'report' && view.valid).toBe(true);
    await expect(prepareIds(file('', ''))).resolves.toMatchObject({ warnings: 0 });
  });
});
