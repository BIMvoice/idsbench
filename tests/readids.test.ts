/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';
import { readIds } from '../src/core/validate';

const outcome = (xml: string): { kind: string; message: string } => {
  try { readIds(xml); return { kind: 'ok', message: '' }; } catch (e) { return e as { kind: string; message: string }; }
};
const kind = (xml: string) => outcome(xml).kind;
const IDS = 'http://standards.buildingsmart.org/IDS';
const SPEC = '<specification name="s" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability></specification>';
const doc = (attrs: string, body = `<specifications>${SPEC}</specifications>`) => `<?xml version="1.0"?><ids ${attrs}><info><title>t</title></info>${body}</ids>`;

describe('readIds error kinds (real parseIDS)', () => {
  it('plain text', () => expect(kind('hello')).toBe('ids-not-xml'));
  it('unclosed tag', () => expect(kind('<ids><info>')).toBe('ids-not-xml'));
  it('well-formed XML that is not an IDS', () => expect(kind('<html><body/></html>')).toBe('ids-rejected'));
  it('a good IDS 1.0 file is read', () => expect(kind(doc(`xmlns="${IDS}"`))).toBe('ok'));
  it('a good file with a byte order mark is read', () => expect(kind('﻿' + doc(`xmlns="${IDS}"`))).toBe('ok'));
  it('a prefixed root in the IDS namespace is read', () =>
    expect(kind(`<ids:ids xmlns:ids="${IDS}"><ids:specifications>${SPEC.replace(/<(\/?)/g, '<$1ids:')}</ids:specifications></ids:ids>`)).toBe('ok'));
});

describe('IDS files that must not run', () => {
  it('an empty file is named as empty', () => expect(outcome('').message).toMatch(/is empty/));
  it('whitespace only is named as empty', () => expect(kind(' \n ')).toBe('ids-empty'));
  it('an IFC model dropped in the IDS box is named as such', () => {
    const o = outcome("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n");
    expect(o.kind).toBe('ids-is-ifc');
    expect(o.message).toMatch(/Put the IDS file in the IDS box and the model in the IFC box/);
  });
  it('the wrong namespace is refused', () => expect(kind(doc('xmlns="http://example.com/not-ids"'))).toBe('ids-namespace'));
  it('no namespace at all is refused', () => expect(kind(doc(''))).toBe('ids-namespace'));
  it('an IDS with no specifications is refused before any model is read', () => {
    expect(kind(doc(`xmlns="${IDS}"`, '<specifications></specifications>'))).toBe('ids-no-specifications');
    expect(kind(doc(`xmlns="${IDS}"`, ''))).toBe('ids-no-specifications');
  });
});
