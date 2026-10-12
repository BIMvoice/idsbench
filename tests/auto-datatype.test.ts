/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A data type the form wrote by itself, because a value was given, goes away with the value, so that on an opened file a
// change that is typed back returns the file to exactly what was opened (the README promises it). A data type the person
// chose, or one the opened file had, is never taken away. The record "written automatically" is not written to the file.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadSchema, type SchemaData } from '@idsbench/check/ifc';
import { keepSource, writeKept } from '../src/core/ids/keep';
import { chooseDataType, withPropertyValue, simple, type Facet, type IdsDocument, type PropertyFacet, type Value } from '../src/core/ids/model';
import { readIdsText } from '../src/core/ids/read';
import { dataTypeFor } from '../src/core/picks';
import { fromList, fromPattern } from '../src/core/ids/value';
import { writeIds } from '../src/core/ids/write';
import { nodeEnv } from './helpers/dom';

let ifc4: SchemaData;
beforeAll(async () => { ifc4 = await loadSchema('IFC4'); });
const typeOf = (set: string, name: string) => dataTypeFor(ifc4, set, name);

// Written the way a person might: tabs, comments, an attribute order of its own, so that writing it again would differ.
const file = (dataType: string) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
\t<info>
\t\t<title>Fire</title>
\t</info>
\t<specifications>
\t\t<!-- walls -->
\t\t<specification name="Walls" ifcVersion="IFC4" minOccurs="0">
\t\t\t<applicability>
\t\t\t\t<entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
\t\t\t</applicability>
\t\t\t<requirements>
\t\t\t\t<property ${dataType}cardinality="required">
\t\t\t\t\t<propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
\t\t\t\t\t<baseName><simpleValue>FireRating</simpleValue></baseName>
\t\t\t\t</property>
\t\t\t</requirements>
\t\t</specification>
\t</specifications>
</ids>
`;
const quiet = <T>(fn: () => T): T => { const e = console.error, w = console.warn; console.error = console.warn = () => {}; try { return fn(); } finally { console.error = e; console.warn = w; } };
const open = (text: string) => { const doc = quiet(() => readIdsText(text, nodeEnv)); const k = quiet(() => keepSource(text, doc, nodeEnv)); if (!k) throw new Error('not kept'); return { doc, k }; };
const withFacet = (doc: IdsDocument, f: PropertyFacet): IdsDocument => ({ ...doc, specifications: [{ ...doc.specifications[0], requirements: [f as Facet] }] });
const propertyOf = (doc: IdsDocument) => doc.specifications[0].requirements[0] as PropertyFacet;
const out = (k: ReturnType<typeof open>['k'], doc: IdsDocument) => quiet(() => writeKept(k, doc, nodeEnv)).text;

describe('a data type written because a value was given goes away with the value', () => {
  it('add a value, remove it: the written XML is the opened file, byte for byte', () => {
    const text = file('');
    const { doc, k } = open(text);
    const p0 = propertyOf(doc);
    expect(p0.dataType).toBeNull();
    const added = withPropertyValue(p0, simple('2HR'), typeOf);
    expect(added.dataType).toBe('IFCLABEL');
    expect(out(k, withFacet(doc, added))).not.toBe(text);
    expect(out(k, withFacet(doc, withPropertyValue(added, null, typeOf)))).toBe(text);
  });

  it('an emptied text, an empty pattern and an empty list take it away too (the value itself is then still there, empty)', () => {
    const text = file('');
    const { doc, k } = open(text);
    const added = withPropertyValue(propertyOf(doc), simple('2HR'), typeOf);
    for (const gone of [simple(''), fromPattern('', 'xs:string'), fromList([''], 'xs:string')] as Value[]) {
      expect(withPropertyValue(added, gone, typeOf)).toMatchObject({ value: gone, dataType: null });
    }
    expect(out(k, withFacet(doc, withPropertyValue(added, null, typeOf)))).toBe(text);
  });

  it('a value changed to another value keeps the data type', () => {
    const { doc } = open(file(''));
    const added = withPropertyValue(propertyOf(doc), simple('2HR'), typeOf);
    expect(withPropertyValue(added, fromList(['1HR', '2HR'], 'xs:string'), typeOf).dataType).toBe('IFCLABEL');
  });

  it('it follows the property: another property of the standard brings its own, and one the standard does not know brings none', () => {
    const { doc } = open(file(''));
    const added = withPropertyValue(propertyOf(doc), simple('2HR'), typeOf);
    const other = withPropertyValue({ ...added, baseName: simple('IsExternal') }, added.value, typeOf);
    expect(other.dataType).toBe('IFCBOOLEAN');
    expect(withPropertyValue({ ...added, baseName: simple('MyOwn') }, added.value, typeOf)).toMatchObject({ dataType: null });
  });

  it('the record is not in the written XML', () => {
    const { doc } = open(file(''));
    const added = withPropertyValue(propertyOf(doc), simple('2HR'), typeOf);
    expect(JSON.stringify(Object.keys(added))).toMatch(/auto/i); // there is a record
    expect(writeIds(withFacet(doc, added))).not.toMatch(/auto/i);
  });
});

describe('a data type that was not written by the form is never taken away', () => {
  it('one in the opened file stays when a value is added and removed, and the file is the opened file', () => {
    const text = file('dataType="IFCTEXT" ');
    const { doc, k } = open(text);
    const added = withPropertyValue(propertyOf(doc), simple('2HR'), typeOf);
    expect(added.dataType).toBe('IFCTEXT');
    const back = withPropertyValue(added, null, typeOf);
    expect(back.dataType).toBe('IFCTEXT');
    expect(out(k, withFacet(doc, back))).toBe(text);
  });

  it('one the person chose stays, also when it is the one the form would have written', () => {
    const { doc } = open(file(''));
    const chosen = { ...propertyOf(doc), dataType: 'IFCLABEL' }; // what the Data type field does: a data type and no record
    expect(withPropertyValue(withPropertyValue(chosen, simple('x'), typeOf), null, typeOf).dataType).toBe('IFCLABEL');
  });

  it('one the person chose after the form wrote its own stays: choosing it clears the record', () => {
    const { doc } = open(file(''));
    const added = withPropertyValue(propertyOf(doc), simple('2HR'), typeOf);
    const chosen = chooseDataType(added, 'IFCLABEL');
    expect(withPropertyValue(chosen, null, typeOf).dataType).toBe('IFCLABEL');
    expect(chooseDataType(added, '').dataType).toBeNull();
  });
});
