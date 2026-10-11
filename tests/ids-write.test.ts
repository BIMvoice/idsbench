import { describe, expect, it } from 'vitest';
import { readIdsText } from '../src/core/ids/read';
import { writeIds, escapeAttr, escapeText } from '../src/core/ids/write';
import { newFacet, occursFor, simple, specChoice, allowedCardinalities, type Facet } from '../src/core/ids/model';
import { nodeEnv } from './helpers/dom';
import { doc, entity, fromLength, fromPattern, fromRange, list, property, spec } from './helpers/ids';

const tags = (xml: string) => [...xml.matchAll(/<(\/?)([A-Za-z:]+)/g)].filter((m) => !m[1]).map((m) => m[2]);

describe('writer: document shape', () => {
  const xml = writeIds(doc(spec()));
  it('declares the IDS namespace and the 1.0 schema location', () => {
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<ids xmlns="http:\/\/standards.buildingsmart.org\/IDS" /);
    expect(xml).toContain('xmlns:xs="http://www.w3.org/2001/XMLSchema"');
    expect(xml).toContain('xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd"');
  });
  it('writes info children in schema order whatever order the fields were filled', () => {
    const d = doc(spec());
    Object.assign(d.info, { milestone: 'M', purpose: 'P', date: '2026-01-02', author: 'a@b.c', description: 'D', version: '1', copyright: 'C' });
    const t = tags(writeIds(d));
    expect(t.slice(t.indexOf('info'), t.indexOf('specifications'))).toEqual(['info', 'title', 'copyright', 'version', 'description', 'author', 'date', 'purpose', 'milestone']);
  });
  it('leaves empty optional info fields out', () => {
    const t = tags(writeIds(doc(spec())));
    expect(t.slice(t.indexOf('info'), t.indexOf('specifications'))).toEqual(['info', 'title']);
  });
  it('writes applicability before requirements', () => {
    const t = tags(writeIds(doc(spec({ requirements: [property('P', 'N')] }))));
    expect(t.indexOf('applicability')).toBeLessThan(t.indexOf('requirements'));
  });
});

describe('writer: facet child order', () => {
  const one = (f: Facet, where: 'applicability' | 'requirements' = 'requirements') => {
    const t = tags(writeIds(doc(spec(where === 'requirements' ? { requirements: [f] } : { applicability: [f] }))));
    return t.slice(t.lastIndexOf(where));
  };
  it('property: propertySet, baseName, value', () => {
    expect(one(property('P', 'N', { value: simple('v') })).filter((t) => !t.startsWith('simple'))).toEqual(['requirements', 'property', 'propertySet', 'baseName', 'value']);
  });
  it('classification: value comes BEFORE system', () => {
    const f = { ...newFacet('classification', 'requirements'), value: simple('c'), system: simple('s') } as Facet;
    expect(one(f).filter((t) => !t.startsWith('simple'))).toEqual(['requirements', 'classification', 'value', 'system']);
  });
  it('entity: name then predefinedType', () => {
    const f = { ...entity('IFCWALL'), predefinedType: simple('X') } as Facet;
    expect(one(f, 'applicability').filter((t) => !t.startsWith('simple'))).toEqual(['applicability', 'entity', 'name', 'predefinedType']);
  });
  it('partOf nests an entity', () => {
    const f = { ...newFacet('partOf', 'requirements'), relation: 'IFCRELNESTS' } as Facet;
    const x = writeIds(doc(spec({ requirements: [f] })));
    expect(x).toContain('<partOf relation="IFCRELNESTS" cardinality="required">');
    expect(x).toMatch(/<partOf[^>]*>\s*<entity>\s*<name>/);
  });
  it('applicability facets are written in the schema order even if the list is not', () => {
    const p = property('P', 'N');
    const m = newFacet('material', 'applicability');
    const t = tags(writeIds(doc(spec({ applicability: [m, p, entity('IFCWALL')] })))).filter((x) => ['entity', 'property', 'material'].includes(x));
    expect(t).toEqual(['entity', 'property', 'material']);
  });
  it('an applicability facet carries no cardinality, uri or instructions (the schema forbids them there)', () => {
    const p = property('P', 'N', { uri: 'http://x', instructions: 'i', cardinality: 'prohibited' } as Partial<Facet>);
    const x = writeIds(doc(spec({ applicability: [p] })));
    expect(x).not.toMatch(/<property[^>]*(cardinality|uri|instructions)/);
  });
});

describe('writer: escaping', () => {
  it('escapes & < > in text and quotes in attributes', () => {
    expect(escapeText('a & b < c > d "q"')).toBe('a &amp; b &lt; c &gt; d "q"');
    expect(escapeAttr('a & "b" <c>')).toBe('a &amp; &quot;b&quot; &lt;c&gt;');
  });
  it('keeps line breaks in attributes as character references', () => {
    expect(escapeAttr('a\nb\tc')).toBe('a&#10;b&#9;c');
  });
  it('drops characters XML 1.0 cannot carry', () => {
    expect(escapeText('a\u0001b')).toBe('ab');
  });
  it('survives a trip through the reader: & < " \' and non-ASCII', () => {
    const nasty = `Wände & Türen <"EI 30"> 'Ä' 日本語 😀`;
    const d = doc(spec({ name: nasty, description: nasty, applicability: [{ ...entity('IFCWALL'), name: simple(nasty) } as Facet] }));
    d.info.title = nasty;
    const back = readIdsText(writeIds(d), nodeEnv);
    expect(back.info.title).toBe(nasty);
    expect(back.specifications[0].name).toBe(nasty);
    expect(back.specifications[0].description).toBe(nasty);
    expect((back.specifications[0].applicability[0] as { name: { value: string } }).name.value).toBe(nasty);
  });
});

describe('writer: each restriction kind', () => {
  const w = (value: ReturnType<typeof list>) => writeIds(doc(spec({ requirements: [property('P', 'N', { value } as Partial<Facet>)] })));
  it('a list is one enumeration per item', () => {
    const x = w(list('A', 'B'));
    expect(x).toContain('<xs:restriction base="xs:string">');
    expect(x).toContain('<xs:enumeration value="A"/>');
    expect(x).toContain('<xs:enumeration value="B"/>');
  });
  it('a pattern', () => expect(w(fromPattern('DT[0-9]{2}', 'xs:string'))).toContain('<xs:pattern value="DT[0-9]{2}"/>'));
  it('a range: lower then upper, inclusive and exclusive', () => {
    const x = w(fromRange({ lower: { value: '3', exclusive: true }, upper: { value: '10', exclusive: false } }, 'xs:double'));
    expect(x).toContain('<xs:restriction base="xs:double">');
    expect(x.indexOf('minExclusive value="3"')).toBeGreaterThan(0);
    expect(x.indexOf('minExclusive')).toBeLessThan(x.indexOf('maxInclusive value="10"'));
  });
  it('a length: exact, at least, at most', () => {
    const x = w(fromLength({ exactly: '3', atLeast: '1', atMost: '5' }, 'xs:string'));
    expect(x).toContain('<xs:length value="3"/>');
    expect(x).toContain('<xs:minLength value="1"/>');
    expect(x).toContain('<xs:maxLength value="5"/>');
  });
  it('escapes a pattern with an ampersand and quotes', () => {
    expect(w(fromPattern('a&b"c', 'xs:string'))).toContain('value="a&amp;b&quot;c"');
  });
  it('keeps a file\'s own annotation on an item', () => {
    const v = { kind: 'restriction' as const, base: 'xs:string', facets: [{ name: 'enumeration' as const, value: '30', annotation: '<xs:annotation><xs:documentation>Half an hour</xs:documentation></xs:annotation>' }] };
    const x = w(v);
    expect(x).toContain('<xs:enumeration value="30"><xs:annotation><xs:documentation>Half an hour');
  });
});

describe('cardinality mapping (user manual, "Cardinality of the applicability entity")', () => {
  it('required = minOccurs 1, maxOccurs unbounded', () => {
    expect(occursFor('required')).toEqual({ minOccurs: '1', maxOccurs: 'unbounded' });
    expect(specChoice({ minOccurs: '1', maxOccurs: 'unbounded' })).toBe('required');
  });
  it('optional = minOccurs 0, maxOccurs unbounded', () => {
    expect(occursFor('optional')).toEqual({ minOccurs: '0', maxOccurs: 'unbounded' });
    expect(specChoice({ minOccurs: '0', maxOccurs: 'unbounded' })).toBe('optional');
  });
  it('prohibited = minOccurs 0, maxOccurs 0', () => {
    expect(occursFor('prohibited')).toEqual({ minOccurs: '0', maxOccurs: '0' });
    expect(specChoice({ minOccurs: '0', maxOccurs: '0' })).toBe('prohibited');
  });
  it('anything else is custom and is written back unchanged', () => {
    expect(specChoice({ minOccurs: '2', maxOccurs: '5' })).toBe('custom');
    expect(writeIds(doc(spec({ minOccurs: '2', maxOccurs: '5' })))).toContain('<applicability minOccurs="2" maxOccurs="5">');
  });
  it('written on the applicability element', () => {
    expect(writeIds(doc(spec({ ...occursFor('prohibited') })))).toContain('<applicability minOccurs="0" maxOccurs="0">');
  });
  it('requirement facets: which choices each kind allows', () => {
    expect(allowedCardinalities('entity')).toBeNull();
    expect(allowedCardinalities('partOf')).toEqual(['required', 'prohibited']);
    for (const k of ['attribute', 'classification', 'property', 'material'] as const) expect(allowedCardinalities(k)).toEqual(['required', 'optional', 'prohibited']);
  });
  it('an entity facet in requirements gets no cardinality attribute', () => {
    expect(writeIds(doc(spec({ requirements: [entity('IFCWALL')] })))).toMatch(/<requirements>\s*<entity>/);
  });
});
