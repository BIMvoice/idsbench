/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// "Elements must have a property" asks that the property exists. IDS 1.0 (User Manual, property facet): "Both dataType
// and value are optional, but if value is provided, it also requires dataType", and the requirement "Applicable objects
// need to have the property My_Prop in the My_Set" is allowed with no data type. A starter that wrote IFCLABEL failed a
// wall whose FireRating is stored as IfcText although it has a fire rating. The data type is written when a value is added.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { loadSchema, type SchemaData } from '@idsbench/check/ifc';
import { blankDocument, isValueGiven, newFacet, simple, withPropertyValue, type Facet, type PropertyFacet, type Specification } from '../src/core/ids/model';
import { PATTERNS } from '../src/core/ids/patterns';
import { fromLength, fromList, fromPattern, fromRange } from '../src/core/ids/value';
import { checkDocument } from '../src/core/ids/check';
import { dataTypeFor } from '../src/core/picks';
import { writeIds } from '../src/core/ids/write';
import { ifcText, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
let ifc4: SchemaData;
beforeAll(async () => { console.log = console.warn = console.error = console.info = () => {}; ifc4 = await loadSchema('IFC4'); });
afterAll(() => { Object.assign(console, saved); });

const G = (n: number) => String(n).padStart(22, '0');
const wallWith = (type: 'IFCLABEL' | 'IFCTEXT' | null) =>
  `#1=IFCWALL('${G(1)}',$,'W',$,$,$,$,$,$);\n` + (type ? `#101=IFCPROPERTYSINGLEVALUE('FireRating',$,${type}('2HR'),$);\n#201=IFCPROPERTYSET('${G(201)}',$,'Pset_WallCommon',$,(#101));\n#301=IFCRELDEFINESBYPROPERTIES('${G(301)}',$,$,$,(#1),#201);\n` : '');
const xmlOf = (s: Specification) => writeIds({ ...blankDocument(), info: { ...blankDocument().info, title: 't' }, specifications: [s] });
const starter = () => PATTERNS.find((p) => p.id === 'property')!.make();
const typeOf = (set: string, name: string) => dataTypeFor(ifc4, set, name);
const propertyOf = (s: Specification) => s.requirements[0] as PropertyFacet;

describe('the property starter asks only that the property exists', () => {
  it('writes no data type, and the Check engine accepts the file', async () => {
    const s = starter();
    expect(propertyOf(s).dataType).toBeNull();
    const xml = xmlOf(s);
    expect(xml).not.toMatch(/dataType=/);
    expect((await checkIds(xml)).findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('a wall with a FireRating passes whether it is stored as IfcLabel or IfcText; a wall with none fails', async () => {
    const xml = xmlOf(starter());
    expect((await runText(xml, ifcText(wallWith('IFCLABEL')))).verdict).toBe('pass');
    expect((await runText(xml, ifcText(wallWith('IFCTEXT')))).verdict).toBe('pass');
    expect((await runText(xml, ifcText(wallWith(null)))).verdict).toBe('fail');
  });

  it('what the starter used to write, a data type, fails the wall that stores it as IfcText: the reason the starter no longer writes one', async () => {
    const withType = { ...starter(), requirements: [{ ...propertyOf(starter()), dataType: 'IFCLABEL' } as Facet] };
    const xml = xmlOf(withType);
    expect((await runText(xml, ifcText(wallWith('IFCLABEL')))).verdict).toBe('pass');
    const text = await runText(xml, ifcText(wallWith('IFCTEXT')));
    expect(text.verdict).toBe('fail');
    expect(text.specs[0].failures[0].reasons.join(' ')).toMatch(/IFCTEXT|data type/i);
  });

  it('a value with no data type is an error for the Check engine (so the data type has to appear with the value)', async () => {
    const s = starter();
    const xml = xmlOf({ ...s, requirements: [{ ...propertyOf(s), value: simple('2HR') } as Facet] });
    const errors = (await checkIds(xml)).findings.filter((f) => f.severity === 'error');
    expect(errors.map((e) => e.code)).toContain('value-needs-datatype');
  });
});

describe('the data type appears when a value is added', () => {
  it('a value of any kind brings the standard data type of the property, and the file is then accepted', async () => {
    for (const value of [simple('2HR'), fromList(['1HR', '2HR'], 'xs:string'), fromPattern('[0-9]HR', 'xs:string')]) {
      const s = starter();
      const withValue = withPropertyValue(propertyOf(s), value, typeOf);
      expect(withValue.dataType).toBe('IFCLABEL');
      expect(withValue.value).toBe(value);
      const xml = xmlOf({ ...s, requirements: [withValue] });
      expect((await checkIds(xml)).findings.filter((f) => f.severity === 'error')).toEqual([]);
      expect((await runText(xml, ifcText(wallWith('IFCLABEL')))).specs[0].state).toBe('pass');
    }
  });

  it('an empty value, a data type already chosen, and a property the standard does not know are left as they are', () => {
    const p = propertyOf(starter());
    expect(withPropertyValue(p, null, typeOf).dataType).toBeNull();
    expect(withPropertyValue(p, simple(''), typeOf).dataType).toBeNull();
    expect(withPropertyValue({ ...p, dataType: 'IFCTEXT' }, simple('x'), typeOf).dataType).toBe('IFCTEXT');
    expect(withPropertyValue({ ...p, baseName: simple('MyOwn') }, simple('x'), typeOf).dataType).toBeNull();
    // A value taken away leaves the data type that was written.
    expect(withPropertyValue(withPropertyValue(p, simple('x'), typeOf), null, typeOf).dataType).toBe('IFCLABEL');
  });

  it('the other starters are untouched, and none of them writes a data type', () => {
    for (const p of PATTERNS) for (const r of p.make().requirements) if (r.kind === 'property') expect(r.dataType).toBeNull();
    expect(newFacet('property', 'requirements')).toMatchObject({ dataType: null });
  });
});

describe('an empty pattern or an empty list is not a value', () => {
  const empty = [fromPattern('', 'xs:string'), fromList([''], 'xs:string'), fromList([], 'xs:string'), fromList(['', ''], 'xs:string'),
    fromRange({ lower: { value: '', exclusive: false }, upper: null }, 'xs:double'), fromLength({ exactly: '', atLeast: '', atMost: '' }, 'xs:string')];
  const given = [simple('x'), fromPattern('[0-9]', 'xs:string'), fromList(['', 'a'], 'xs:string'), fromRange({ lower: { value: '1', exclusive: false }, upper: null }, 'xs:double'), fromLength({ exactly: '', atLeast: '3', atMost: '' }, 'xs:string')];

  it('one function says so, for nothing, an empty text, an empty pattern, an empty list, an empty range and an empty length', () => {
    expect([null, simple(''), ...empty].map((v) => isValueGiven(v))).toEqual(Array(2 + empty.length).fill(false));
    expect(given.map((v) => isValueGiven(v))).toEqual(Array(given.length).fill(true));
  });

  it('withPropertyValue writes no data type for an empty one (the Value mode switched to pattern or list and left empty)', () => {
    for (const v of empty) expect(withPropertyValue(propertyOf(starter()), v, typeOf).dataType).toBeNull();
  });

  it('the guard rails use the same function: an empty pattern asks for the pattern, not for a data type', () => {
    const s = starter();
    const d = { ...blankDocument(), specifications: [{ ...s, requirements: [{ ...propertyOf(s), value: fromPattern('', 'xs:string') } as Facet] }] };
    const issues = checkDocument(d).filter((i) => i.level === 'error');
    expect(issues.map((i) => i.message)).toContain('Type the pattern.');
    expect(issues.map((i) => i.message).join(' ')).not.toMatch(/data type/);
  });
});
