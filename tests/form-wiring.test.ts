/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The rules for a name that is typed or emptied (core/ids/naming.ts) and for a value given to a property
// (core/ids/model.ts) are tested where they are written. These tests say that the form uses them: the form is rendered
// once (to text, no browser), the field concerned is caught as the form made it, and what the field tells the form is
// followed to what the form hands on.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSchema } from '@idsbench/check/ifc';
import { simple, type Facet, type PropertyFacet, type Specification, type Value } from '../src/core/ids/model';
import { fromList, fromPattern } from '../src/core/ids/value';
import { PATTERNS } from '../src/core/ids/patterns';
import { listsFor, type Lists } from '../src/core/picks';

const seen = vi.hoisted(() => ({ combo: new Map<string, { onChange: (v: string) => void }>(), text: new Map<string, { onChange: (v: string) => void }>(), value: new Map<string, { onChange: (v: unknown) => void }>() }));
vi.mock('../src/ui/write/fields', async (original) => ({
  ...(await original<typeof import('../src/ui/write/fields')>()),
  TextField: (p: { dataKey?: string; onChange: (v: string) => void }) => { if (p.dataKey) seen.text.set(p.dataKey, p); return null; },
}));
vi.mock('../src/ui/write/Combo', () => ({
  Combo: (p: { dataKey?: string; onChange: (v: string) => void }) => { if (p.dataKey) seen.combo.set(p.dataKey, p); return null; },
}));
vi.mock('../src/ui/write/ValueField', () => ({
  ValueField: (p: { dataKey?: string; onChange: (v: unknown) => void }) => { if (p.dataKey) seen.value.set(p.dataKey, p); return null; },
}));

const { SpecEditor } = await import('../src/ui/write/SpecEditor');
const { FacetFields } = await import('../src/ui/write/FacetRow');

const starter = () => PATTERNS.find((p) => p.id === 'property')!.make();
let lists: Lists;
beforeAll(async () => { lists = listsFor([await loadSchema('IFC4')]); });

describe('the name field of the form', () => {
  const nameField = (spec: Specification, onChange: (s: Specification) => void) => {
    renderToStaticMarkup(createElement(SpecEditor, { spec, issues: [], onChange, focusKey: null, subtypes: null }));
    return seen.text.get(`${spec.uid}.name`)!;
  };

  it('a name typed stops the name following the content, and a field emptied lets it follow again', () => {
    const got: Specification[] = [];
    const generated = starter();
    expect(generated.autoName).toBe(true);
    nameField(generated, (s) => got.push(s)).onChange('Fire ratings');
    expect(got[0].name).toBe('Fire ratings');
    expect(got[0].autoName).toBeUndefined();
    nameField(got[0], (s) => got.push(s)).onChange('');
    expect(got[1].name).toBe('');
    expect(got[1].autoName).toBe(true);
  });
});

describe('the value field of a property in the form', () => {
  const valueField = (facet: Facet, onChange: (f: Facet) => void) => {
    renderToStaticMarkup(createElement(FacetFields, { facet, requirement: true, issues: [], onChange, lists, several: false, appliesTo: 'IFCWALL' }));
    return seen.value.get(`${facet.uid}.value`)! as { onChange: (v: Value | null) => void };
  };

  it('a value given to the starter\'s property brings the data type the standard states for it', () => {
    const got: PropertyFacet[] = [];
    const property = starter().requirements[0] as PropertyFacet;
    expect(property.dataType).toBeNull();
    valueField(property, (f) => got.push(f as PropertyFacet)).onChange(simple('2HR'));
    expect(got[0].value).toEqual(simple('2HR'));
    expect(got[0].dataType).toBe('IFCLABEL');
  });
});

describe('the Value mode switched to pattern or list and left empty', () => {
  it('brings no data type: an empty pattern or list is not a value', () => {
    const property = starter().requirements[0] as PropertyFacet;
    for (const empty of [fromPattern('', 'xs:string'), fromList([''], 'xs:string')]) {
      const got: PropertyFacet[] = [];
      renderToStaticMarkup(createElement(FacetFields, { facet: property, requirement: true, issues: [], onChange: (f) => got.push(f as PropertyFacet), lists, several: false, appliesTo: 'IFCWALL' }));
      (seen.value.get(`${property.uid}.value`)! as { onChange: (v: Value | null) => void }).onChange(empty);
      expect(got[0].value).toEqual(empty);
      expect(got[0].dataType).toBeNull();
    }
  });
});

describe('choosing a standard property in the form', () => {
  const fieldOf = (facet: Facet, key: string, onChange: (f: Facet) => void) => {
    renderToStaticMarkup(createElement(FacetFields, { facet, requirement: true, issues: [], onChange, lists, several: false, appliesTo: 'IFCWALL' }));
    return seen.value.get(`${facet.uid}.${key}`)! as { onChange: (v: Value | null) => void };
  };

  it('writes no data type: the requirement stays "the property exists", and the data type comes with a value', () => {
    const got: PropertyFacet[] = [];
    const property = { ...(starter().requirements[0] as PropertyFacet), baseName: simple('') };
    expect(lists.dataTypeFor('Pset_WallCommon', 'FireRating')).toBe('IFCLABEL'); // the standard does state one
    fieldOf(property, 'baseName', (f) => got.push(f as PropertyFacet)).onChange(simple('FireRating'));
    expect(got[0].baseName).toEqual(simple('FireRating'));
    expect(got[0].dataType).toBeNull();
  });
});

describe('the Data type field of a property in the form', () => {
  it('a data type chosen there is the person\'s: the value taken away afterwards leaves it', () => {
    const got: PropertyFacet[] = [];
    const render = (facet: PropertyFacet) => {
      renderToStaticMarkup(createElement(FacetFields, { facet, requirement: true, issues: [], onChange: (f) => got.push(f as PropertyFacet), lists, several: false, appliesTo: 'IFCWALL' }));
    };
    const property = starter().requirements[0] as PropertyFacet;
    render(property);
    (seen.value.get(`${property.uid}.value`)! as { onChange: (v: Value | null) => void }).onChange(simple('2HR'));
    expect(got[0]).toMatchObject({ dataType: 'IFCLABEL', autoDataType: true });
    render(got[0]);
    seen.combo.get(`${property.uid}.dataType`)!.onChange('IFCLABEL');
    expect(got[1].autoDataType).toBeUndefined();
    render(got[1]);
    (seen.value.get(`${property.uid}.value`)! as { onChange: (v: Value | null) => void }).onChange(null);
    expect(got[2].dataType).toBe('IFCLABEL');
  });
});
