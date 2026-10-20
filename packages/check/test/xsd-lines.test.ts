/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// libxml2 gives a schema error only a line, and the finding was placed on the element of that name on that line. Two
// cases put it on the wrong specification: past line 65,534 libxml2's line is not the element's (it said 65,535 for an
// error on line 68,001), and in a file written on one line every element is on line 1, so every finding went to the
// first specification. Here such a finding is placed by the element's name when only one element has it, and otherwise
// on no element and no line, saying why (`unplaced`): never on the wrong specification.
import { describe, expect, it } from 'vitest';
import { checkIds } from '../src/index.ts';
import { parseTree } from '../src/xml.ts';
import { interpret } from '../src/xsd.ts';
import { NS } from './helpers.ts';

const head = `<ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd"><info><title>t</title></info><specifications>`;
const tail = '</specifications></ids>';
/** Specification `i`, on one line; `bad` gives it an IFC version the schema does not allow, `bogus` an element it does not allow. */
const spec = (i: number, o: { bad?: boolean; bogus?: boolean } = {}) =>
  `<specification name="S${i}" ifcVersion="${o.bad ? 'IFC9' : 'IFC4'}"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name>${o.bogus ? '<bogus/>' : ''}</entity></applicability></specification>`;
const xsd = async (xml: string) => (await checkIds(xml)).findings.filter((f) => f.code.startsWith('xsd-'));

describe('a schema error past line 65,534', () => {
  it('is not placed on another specification', async () => {
    const N = 70_000, BAD = 68_000; // specification i is on line i + 1
    const xml = `${head}\n${Array.from({ length: N }, (_, i) => spec(i + 1, { bad: i + 1 === BAD, bogus: i + 1 === BAD })).join('\n')}\n${tail}`;
    const found = await xsd(xml);
    const version = found.find((f) => f.code === 'xsd-invalid-value')!;
    // Several elements are named <specification>: where it is cannot be said, so it is said about the file.
    expect(version).toMatchObject({ line: undefined, path: undefined });
    expect(version.message).toMatch(/is 'IFC9'/);
    expect(version.unplaced).toBe('The schema check cannot say where in the file this is: past line 65,534 the line numbers it gives are not reliable.');
    // The only <bogus> in the file is where it is, whatever line libxml2 gives.
    expect(found.find((f) => f.code === 'xsd-unexpected-element')).toMatchObject({ line: BAD + 1, path: `ids/specifications/specification[${BAD}]/applicability/entity/bogus` });
  });
});

describe('a schema error in a file written on one line', () => {
  it('is not placed on the first specification', async () => {
    const found = await xsd(head + spec(1) + spec(2, { bogus: true }) + spec(3, { bad: true }) + tail);
    const version = found.find((f) => f.code === 'xsd-invalid-value')!;
    expect(version).toMatchObject({ line: undefined, path: undefined });
    expect(version.unplaced).toBe('The schema check gives only the line, and line 1 holds more than one <specification>, so which one it is cannot be said.');
    expect(found.find((f) => f.code === 'xsd-unexpected-element')).toMatchObject({ line: 1, path: 'ids/specifications/specification[2]/applicability/entity/bogus' });
  });

  it('is placed as before when the line says which element it is', async () => {
    const found = await xsd(`${head}\n${spec(1)}\n${spec(2, { bad: true })}\n${spec(3, { bad: true })}\n${tail}`);
    expect(found.filter((f) => f.code === 'xsd-invalid-value').map((f) => [f.line, f.path])).toEqual([[3, 'ids/specifications/specification[2]'], [4, 'ids/specifications/specification[3]']]);
  });
});

describe('a schema finding that is not placed', () => {
  it('is still told apart from the others by the line libxml2 gave it', () => {
    const { root } = parseTree(head + spec(1) + spec(2) + tail);
    const at = (line: number, what: string) => `document.xml:${line}: Schemas validity error : Element '{${NS}}specification', attribute 'ifcVersion': ${what}`;
    // A list type error repeats the enumeration error on its own line only; two lines past 65,534 are not one line.
    const raw = [at(70_000, "[facet 'enumeration'] The value 'IFC9' is not an element of the set {'IFC4'}."), at(70_000, "'IFC9' is not a valid value of the local list type."), at(70_005, "'IFC8' is not a valid value of the local list type."), ''].join('\n');
    const found = interpret(raw, root).findings;
    expect(found.map((f) => [f.line, /IFC9/.test(f.message), /IFC8/.test(f.message)])).toEqual([[undefined, true, false], [undefined, false, true]]);
  });
});
