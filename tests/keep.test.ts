// The file the user gets is the file they made: an opened file that is not changed comes out character for character,
// and a change stays inside the specification (or the info section) it was made in.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keepSource, sameContent, writeKept } from '../src/core/ids/keep';
import type { IdsDocument, Specification } from '../src/core/ids/model';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { nodeEnv } from './helpers/dom';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', 'packages', 'check', 'test', 'fixtures', 'corpus');
const all: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.ids')) all.push(p); } };
walk(corpus);
const quietly = <T>(fn: () => T): T => { const e = console.error, w = console.warn; console.error = console.warn = () => {}; try { return fn(); } finally { console.error = e; console.warn = w; } };
const read = (text: string) => quietly(() => readIdsText(text, nodeEnv));
/** Every corpus file the forms can open, with what the reader made of it. */
const opened = all.flatMap((file) => {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  try { return [{ file, text, doc: read(text) }]; } catch { return []; }
});
const renamed = (doc: IdsDocument, i: number, name: string): IdsDocument => ({ ...doc, specifications: doc.specifications.map((s, j) => (j === i ? { ...s, name } : s)) });
const keep = (text: string, doc = read(text)) => { const k = quietly(() => keepSource(text, doc, nodeEnv)); if (!k) throw new Error('not kept'); return { k, doc }; };

describe('an opened file that is not changed', () => {
  it('is kept for every corpus file the forms can open, and is written back character for character', () => {
    expect(opened.length).toBeGreaterThan(400);
    const different = opened.filter(({ text, doc }) => { const k = quietly(() => keepSource(text, doc, nodeEnv)); return !k || writeKept(k, doc).text !== text; });
    expect(different.map((d) => d.file)).toEqual([]);
  });
  it('is what a change that is typed back returns to', () => {
    for (const { text, doc } of opened.filter((o) => o.doc.specifications.length > 0).slice(0, 60)) {
      const { k } = keep(text, doc);
      const changed = renamed(doc, 0, `${doc.specifications[0].name} (changed)`);
      expect(writeKept(k, changed).text).not.toBe(text);
      expect(writeKept(k, renamed(changed, 0, doc.specifications[0].name)).text).toBe(text);
    }
  });
});

describe('one change to one specification', () => {
  it('leaves every character outside that specification as the file has it, in every corpus file', () => {
    const bad: string[] = [];
    for (const { file, text, doc } of opened) {
      if (doc.specifications.length === 0) continue;
      const { k } = keep(text, doc);
      const i = doc.specifications.length - 1;
      const edited = renamed(doc, i, `${doc.specifications[i].name} x`);
      const out = writeKept(k, edited).text;
      const before = k.before + k.info + k.between + k.specs.slice(0, i).map((s) => s.lead + s.body).join('') + k.specs[i].lead;
      if (!out.startsWith(before) || !out.endsWith(k.tail) || !sameContent(read(out), edited)) bad.push(file);
    }
    expect(bad).toEqual([]);
  });
});

const FILE = [
  '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
  '<?editor keep="this"?>',
  '<!-- A note before the root. -->',
  '<i:ids xmlns:xsd="http://www.w3.org/2001/XMLSchema"   xmlns:i="http://standards.buildingsmart.org/IDS"',
  '       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">',
  '\t<i:info>',
  '\t\t<i:title>Caf&#233; &amp; <![CDATA[<bar>]]></i:title><!-- about the title -->',
  '\t</i:info>',
  '\t<i:specifications>',
  '\t\t<!-- the first one -->',
  '\t\t<i:specification ifcVersion="IFC4"   name=\'Walls &gt; 1\'>',
  '\t\t\t<i:applicability minOccurs="1" maxOccurs="unbounded"><i:entity><i:name><i:simpleValue>IFCWALL</i:simpleValue></i:name></i:entity></i:applicability>',
  '\t\t\t<!-- inside the first -->',
  '\t\t\t<i:requirements><i:attribute><i:name><i:simpleValue>Name</i:simpleValue></i:name><i:value><xsd:restriction base="xsd:string"><xsd:annotation><xsd:documentation>why</xsd:documentation></xsd:annotation><xsd:pattern value="W.*"/></xsd:restriction></i:value></i:attribute></i:requirements>',
  '\t\t</i:specification>',
  '\t\t<!-- the second one -->',
  '\t\t<i:specification name="Doors" ifcVersion="IFC4"><i:applicability minOccurs="0" maxOccurs="unbounded"><i:entity><i:name><i:simpleValue>IFCDOOR</i:simpleValue></i:name></i:entity></i:applicability><i:requirements><i:material cardinality="required"/></i:requirements></i:specification>',
  '\t</i:specifications>',
  '</i:ids>',
].join('\r\n');

describe('a file with comments, instructions, CDATA, references, its own prefixes, tabs and CRLF', () => {
  const { k, doc } = keep(FILE);
  const firstEnd = FILE.indexOf('<!-- the second one -->');
  const secondStart = FILE.indexOf('<i:specification name="Doors"');
  it('is read as what it says', () => {
    expect(doc.info.title).toBe('Café & <bar>');
    expect(doc.specifications.map((s) => s.name)).toEqual(['Walls > 1', 'Doors']);
  });
  it('comes back unchanged when nothing is changed', () => expect(writeKept(k, doc).text).toBe(FILE));
  it('a change to the second specification leaves everything before it and after it untouched, and uses the file\'s prefix, tabs and CRLF', () => {
    const edited = renamed(doc, 1, 'Doors and gates');
    const w = writeKept(k, edited);
    expect(w.text.slice(0, secondStart)).toBe(FILE.slice(0, secondStart));
    expect(w.text.endsWith('\r\n\t</i:specifications>\r\n</i:ids>')).toBe(true);
    const part = w.text.slice(secondStart, w.text.indexOf('</i:specification>', secondStart));
    expect(part).toContain('<i:specification name="Doors and gates" ifcVersion="IFC4">\r\n\t\t\t<i:applicability minOccurs="0" maxOccurs="unbounded">\r\n\t\t\t\t<i:entity>');
    expect(part).not.toMatch(/[^\r]\n/);
    expect(w.commentsLost).toEqual([]);
    expect(sameContent(read(w.text), edited)).toBe(true);
  });
  it('a change to the first specification keeps the comment above it, says that the comment inside it is not kept, and writes the restriction with the file\'s schema prefix', () => {
    const edited = renamed(doc, 0, 'Walls');
    const w = writeKept(k, edited);
    expect(w.commentsLost).toEqual(['Walls']);
    expect(w.text).toContain('<!-- the first one -->\r\n\t\t<i:specification name="Walls" ifcVersion="IFC4">');
    expect(w.text).not.toContain('inside the first');
    expect(w.text).toContain('<xsd:restriction base="xsd:string">');
    expect(w.text).toContain('<xsd:pattern value="W.*"/>');
    expect(w.text).toContain('<xsd:documentation>why</xsd:documentation>');
    expect(w.text.endsWith(FILE.slice(firstEnd))).toBe(true);
    expect(sameContent(read(w.text), edited)).toBe(true);
  });
  it('a change to the title rewrites the info section only, and says its comment is not kept', () => {
    const edited = { ...doc, info: { ...doc.info, title: 'Other' } };
    const w = writeKept(k, edited);
    const infoEnd = FILE.indexOf('</i:info>') + '</i:info>'.length;
    expect(w.infoCommentsLost).toBe(true);
    expect(w.text.slice(0, FILE.indexOf('<i:info>'))).toBe(FILE.slice(0, FILE.indexOf('<i:info>')));
    expect(w.text).toContain('<i:info>\r\n\t\t<i:title>Other</i:title>\r\n\t</i:info>');
    expect(w.text.slice(w.text.indexOf('</i:info>') + 9)).toBe(FILE.slice(infoEnd));
  });
  it('moving, deleting and adding keep each remaining specification as the file has it, with the comment above it', () => {
    const [a, b] = doc.specifications;
    const moved = writeKept(k, { ...doc, specifications: [b, a] }).text;
    expect(moved.indexOf('<!-- the second one -->')).toBeLessThan(moved.indexOf('<!-- the first one -->'));
    expect(moved).toContain(FILE.slice(secondStart, FILE.indexOf('\r\n\t</i:specifications>')));
    expect(sameContent(read(moved), { ...doc, specifications: [b, a] })).toBe(true);
    const deleted = writeKept(k, { ...doc, specifications: [b] }).text;
    expect(deleted).not.toContain('the first one');
    expect(deleted).toContain('<!-- the second one -->');
    const extra: Specification = { ...b, uid: 'new', name: 'Added' };
    const added = { ...doc, specifications: [a, b, extra] };
    const out = writeKept(k, added).text;
    expect(out.startsWith(FILE.slice(0, FILE.indexOf('\r\n\t</i:specifications>')))).toBe(true);
    expect(sameContent(read(out), added)).toBe(true);
  });
  it('the fix "write this specification again" writes it anew though it says the same', () => {
    const again = writeKept(k, { ...doc, specifications: [doc.specifications[0], { ...doc.specifications[1], rewrite: true }] }).text;
    expect(again).not.toBe(FILE);
    expect(again.slice(0, secondStart)).toBe(FILE.slice(0, secondStart));
    expect(sameContent(read(again), doc)).toBe(true);
    expect(writeKept(k, { ...doc, rewrite: 'all' }).text).toBe(writeIds(doc));
  });
});

describe('what cannot be kept safely is not kept at all', () => {
  const plain = writeIds(read(FILE));
  it('a file with a document type declaration, or one whose root does not declare the IDS namespace itself', () => {
    const d = read(plain);
    expect(quietly(() => keepSource(plain.replace('<ids ', '<!DOCTYPE ids>\n<ids '), d, nodeEnv))).toBeNull();
    expect(quietly(() => keepSource(plain, { ...d, specifications: [] }, nodeEnv))).toBeNull();
  });
  it('a file that does not bind the schema namespace on its root gets it declared where a rewritten restriction needs it', () => {
    expect(plain).toContain('<xs:restriction base="xs:string">'); // the file said xsd:string; the name follows the prefix of the file written
    const noXs = plain.replace(' xmlns:xs="http://www.w3.org/2001/XMLSchema"', '').replace('<xs:restriction base="xs:string">', '<xs:restriction xmlns:xs="http://www.w3.org/2001/XMLSchema" base="xs:string">');
    const { k, doc } = keep(noXs);
    const edited = renamed(doc, 0, 'Again');
    const out = writeKept(k, edited).text;
    expect(out).toContain('<xs:restriction xmlns:xs="http://www.w3.org/2001/XMLSchema" base="xs:string">');
    expect(sameContent(read(out), edited)).toBe(true);
  });
});
