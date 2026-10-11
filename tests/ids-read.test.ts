import { describe, expect, it } from 'vitest';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { nodeEnv } from './helpers/dom';
import { doc, entity, list, property, spec } from './helpers/ids';

const NS = 'http://standards.buildingsmart.org/IDS';
const file = (loc: string | null, extra = '') =>
  `<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${loc ? ` xsi:schemaLocation="${NS} ${loc}"` : ''}${extra}><info><title>t</title></info><specifications><specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability></specification></specifications></ids>`;
const open = (x: string) => { try { return readIdsText(x, nodeEnv); } catch (e) { return e as { kind: string; message: string }; } };

describe('opening a file: IDS 1.0 only', () => {
  it('opens a file that declares 1.0', () => {
    const d = open(file('http://standards.buildingsmart.org/IDS/1.0/ids.xsd'));
    expect('specifications' in d && d.specifications.length).toBe(1);
  });
  it('refuses 0.9.7 with a sentence naming the version', () => {
    const e = open(file('http://standards.buildingsmart.org/IDS/0.9.7/ids.xsd')) as { kind: string; message: string };
    expect(e.kind).toBe('ids-old-version');
    expect(e.message).toBe('This file is IDS 0.9.7. idsbench works with IDS 1.0 only. Update the file to version 1.0 and check it again.');
  });
  it('refuses 0.9.6 and anything else', () => {
    expect((open(file('http://standards.buildingsmart.org/IDS/0.9.6/ids.xsd')) as { kind: string }).kind).toBe('ids-old-version');
    expect((open(file('http://standards.buildingsmart.org/IDS/2.0/ids.xsd')) as { message: string }).message).toMatch(/IDS 2\.0/);
  });
  it('refuses a file that declares no version', () => {
    const e = open(file(null)) as { kind: string; message: string };
    expect(e.kind).toBe('ids-old-version');
    expect(e.message).toMatch(/has no xsi:schemaLocation, so the IDS version is unknown/);
  });
  it('names an IFC model, an empty file and a non-IDS file plainly', () => {
    expect((open('ISO-10303-21;\nHEADER;') as { kind: string }).kind).toBe('ids-is-ifc');
    expect((open('  ') as { kind: string }).kind).toBe('ids-empty');
    expect((open('<html/>') as { kind: string }).kind).toBe('ids-rejected');
  });
  it('refuses a 1.0 file in another namespace', () => {
    const e = open(file('http://standards.buildingsmart.org/IDS/1.0/ids.xsd').replace(NS + '"', 'http://example.com/x"')) as { kind: string };
    expect(e.kind).toBe('ids-namespace');
  });
});

describe('reading', () => {
  it('reads a prefixed file the same as a default-namespace one', () => {
    const d = doc(spec({ requirements: [property('P', 'N', { value: list('a', 'b') } as never)] }));
    const plain = writeIds(d);
    const prefixed = plain.replace(/<(\/?)(?!xs:|\?)([A-Za-z]+)/g, '<$1ids:$2').replace('xmlns="' + NS + '"', 'xmlns:ids="' + NS + '"');
    const a = readIdsText(plain, nodeEnv), b = readIdsText(prefixed, nodeEnv);
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x).replace(/"uid":"[^"]*",?/g, ''));
    expect(strip(b)).toEqual(strip(a));
  });
  it('applies the schema defaults for a missing minOccurs / maxOccurs', () => {
    const x = file('http://standards.buildingsmart.org/IDS/1.0/ids.xsd').replace(' minOccurs="1" maxOccurs="unbounded"', ' maxOccurs="unbounded"');
    expect((open(x) as ReturnType<typeof doc>).specifications[0].minOccurs).toBe('1');
  });
  it('write then read gives the same model', () => {
    const d = doc(spec({ description: 'x', requirements: [entity('IFCWALL'), property('P', 'N', { value: list('a'), dataType: 'IFCLABEL' } as never)] }));
    const back = readIdsText(writeIds(d), nodeEnv);
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x).replace(/"uid":"[^"]*",?/g, ''));
    expect(strip(back)).toEqual(strip(d));
  });
});
