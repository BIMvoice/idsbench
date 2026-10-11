import { describe, expect, it } from 'vitest';
import { readIds } from '../src/core/validate';
import { declaredIdsVersion } from '../src/core/idsfile';

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
  it('an IDS 0.9.x draft is refused by name, even one the library would read', () => {
    const o = outcome(doc(`xmlns="${IDS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${IDS} ${IDS}/0.9.7/ids.xsd"`));
    expect(o.kind).toBe('ids-old-version');
    expect(o.message).toMatch(/IDS 0\.9\.7/);
  });
  it('a 0.9.6 draft that the library rejects for its structure still gets the draft message', () => {
    const old = `<ids:ids xmlns:ids="${IDS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${IDS} ${IDS}/0.9.6/ids.xsd"><ids:specifications><ids:specification name="o" ifcVersion="IFC4"><ids:applicability><ids:property><ids:propertySet><ids:simpleValue>P</ids:simpleValue></ids:propertySet><ids:name><ids:simpleValue>N</ids:simpleValue></ids:name></ids:property></ids:applicability></ids:specification></ids:specifications></ids:ids>`;
    expect(kind(old)).toBe('ids-old-version');
  });
  it('the declared version is read from the schema location', () => {
    expect(declaredIdsVersion(`${IDS} ${IDS}/1.0/ids.xsd`)).toBe('1.0');
    expect(declaredIdsVersion(`${IDS} ${IDS}/0.9.6/ids.xsd`)).toBe('0.9.6');
    expect(declaredIdsVersion(`${IDS} ${IDS}/ids_09.xsd`)).toBe('0.9');
    expect(declaredIdsVersion(`${IDS} ${IDS}/ids.xsd`)).toBeNull();
    expect(declaredIdsVersion(undefined)).toBeNull();
  });
});
