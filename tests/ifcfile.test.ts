import { describe, expect, it } from 'vitest';
import { inspectIfc, schemaFamily } from '../src/core/ifcfile';

const bytes = (s: string | Uint8Array): ArrayBuffer => {
  const u = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};
const ifc = (schema = 'IFC4', body = "#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,'Waldo',$,$,$,$,$,$);\n") =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
const kind = (b: ArrayBuffer) => { try { return inspectIfc(b).schema; } catch (e) { return (e as { kind: string }).kind; } };

describe('inspectIfc accepts', () => {
  it('a complete file, and reports the version as the file names it', () => {
    expect(kind(bytes(ifc()))).toBe('IFC4');
    expect(kind(bytes(ifc('IFC2X3')))).toBe('IFC2X3');
    expect(kind(bytes(ifc('IFC4X3_ADD2')))).toBe('IFC4X3_ADD2');
  });
  it('a file with a UTF-8 byte order mark', () => expect(kind(bytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(ifc())])))).toBe('IFC4'));
  it('a file written as one long line', () => expect(kind(bytes(ifc().replace(/\n/g, '')))).toBe('IFC4'));
  it('a file with blank lines after the closing line', () => expect(kind(bytes(ifc() + '\r\n\r\n'))).toBe('IFC4'));
});

describe('inspectIfc refuses, each with its own message', () => {
  it('an empty file', () => expect(kind(bytes(''))).toBe('ifc-empty'));
  it('a file cut off in the middle of the model, although its header is valid', () => {
    const whole = ifc('IFC4', Array.from({ length: 50 }, (_, i) => `#${i + 1}=IFCWALL('g${i}',$,'W',$,$,$,$,$,$);\n`).join(''));
    expect(kind(bytes(whole.slice(0, whole.length >> 1)))).toBe('ifc-cut-off');
  });
  it('a file that stops right after the header', () => expect(kind(bytes(ifc().split('DATA;')[0] + 'DATA;\n'))).toBe('ifc-cut-off'));
  it('a zip, even one that holds the IFC text unpacked', () => {
    expect(kind(bytes('PK\u0003\u0004' + ifc()))).toBe('ifc-is-zip');
  });
  it('an ifcXML file', () => expect(kind(bytes('<?xml version="1.0"?><ifcXML><!-- ISO-10303-21 --></ifcXML>'))).toBe('ifc-is-xml'));
  it('an IDS file dropped in the IFC box', () =>
    expect(kind(bytes('<?xml version="1.0"?>\n<ids xmlns="http://standards.buildingsmart.org/IDS"><!-- ISO-10303-21; END-ISO-10303-21; --></ids>'))).toBe('ifc-is-ids'));
  it('text that only mentions the IFC marker further down', () => expect(kind(bytes('notes\n' + ifc()))).toBe('ifc-not-step'));
  it('an IFC version that IDS does not cover, instead of calling it IFC4', () => {
    expect(kind(bytes(ifc('IFC2X2_FINAL')))).toBe('ifc-schema');
    expect(kind(bytes(ifc('IFC4X1')))).toBe('ifc-schema');
  });
  it('a file that names no IFC version', () => expect(kind(bytes(ifc().replace(/FILE_SCHEMA[^\n]*\n/, '')))).toBe('ifc-schema'));
  it('messages name the version and say what to do', () => {
    try { inspectIfc(bytes(ifc('IFC2X2_FINAL'))); } catch (e) { expect((e as Error).message).toMatch(/This model is IFC2X2_FINAL\. IDS covers IFC2X3, IFC4 and IFC4X3 only/); }
  });
});

describe('schemaFamily', () => {
  it('editions of IFC4X3 are one version; IFC4 is another', () => {
    expect(schemaFamily('IFC4X3_ADD2')).toBe('IFC4X3');
    expect(schemaFamily('ifc4x3')).toBe('IFC4X3');
    expect(schemaFamily('IFC4')).toBe('IFC4');
    expect(schemaFamily('IFC2X3')).toBe('IFC2X3');
  });
});
