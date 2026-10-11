// What writing a part of an IDS file again leaves out, listed in words.
import { describe, expect, it } from 'vitest';
import { keepSource, wholeLoss, writeKept } from '../src/core/ids/keep';
import { leftOutSentence, lostBetween, lostBetweenDocuments, rootStartTag, sayLost, wrap } from '../src/core/ids/lost';
import { readIdsText } from '../src/core/ids/read';
import { nodeEnv } from './helpers/dom';

const NS = 'http://standards.buildingsmart.org/IDS';
const ids = (specs: string, extraRoot = '', info = '<info><title>T</title></info>') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${extraRoot} xsi:schemaLocation="${NS} http://standards.buildingsmart.org/IDS/1.0/ids.xsd">\n  ${info}\n  <specifications>\n${specs}\n  </specifications>\n</ids>\n`;
const NAMED = '<attribute><name><simpleValue>Name</simpleValue></name></attribute>';
const plain = (name: string, req = '', after = '') => `    <specification name="${name}" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements>${NAMED}${req}</requirements>${after}
    </specification>`;
const quiet = <T>(fn: () => T): T => { const e = console.error, w = console.warn; console.error = console.warn = () => {}; try { return fn(); } finally { console.error = e; console.warn = w; } };
const open = (text: string) => { const doc = quiet(() => readIdsText(text, nodeEnv)); const k = quiet(() => keepSource(text, doc, nodeEnv)); if (!k) throw new Error('not kept'); return { doc, k }; };
const renameFirst = (doc: ReturnType<typeof open>['doc'], to: string) => ({ ...doc, specifications: doc.specifications.map((s, i) => (i === 0 ? { ...s, name: to } : s)) });
const lostOf = (text: string, to = 'Renamed') => { const { doc, k } = open(text); return writeKept(k, renameFirst(doc, to), nodeEnv).lost; };
const enumReq = (inner: string, attrs = '') => `<property dataType="IFCLABEL"${attrs}><propertySet><simpleValue>P</simpleValue></propertySet><baseName><simpleValue>B</simpleValue></baseName><value><xs:restriction base="xs:string">${inner}</xs:restriction></value></property>`;

describe('what is left out of a specification that is written again', () => {
  it('nothing, for a file made of what the editor knows (and it says so by listing nothing)', () => {
    expect(lostOf(ids(plain('A', enumReq('<xs:enumeration value="x"/><xs:enumeration value="y"/>'))))).toEqual([]);
  });
  it('comments inside it, counted', () => {
    const l = lostOf(ids(plain('A', '<!-- one --><!-- two -->')));
    expect(l.map((p) => [p.part, p.name, sayLost(p.items)])).toEqual([[1, 'Renamed', '2 comments']]);
    expect(sayLost(lostOf(ids(plain('A', '<!-- one -->')))[0].items)).toBe('1 comment');
  });
  it('the attribute fixed on a list value, which the editor does not hold', () => {
    const l = lostOf(ids(plain('A', enumReq('<xs:enumeration value="x" fixed="true"/><xs:enumeration value="y"/>'))));
    expect(sayLost(l[0].items)).toBe('the attribute fixed on a list value');
    const two = lostOf(ids(plain('A', enumReq('<xs:enumeration value="x" fixed="true"/><xs:enumeration value="y" fixed="false"/>'))));
    expect(sayLost(two[0].items)).toBe('the attribute fixed on 2 list values');
  });
  it('an element of another namespace, wherever it stands, and the attribute of another namespace', () => {
    const text = ids(plain('A', '', '<other:note xmlns:other="urn:other">keep me</other:note>'), '');
    expect(sayLost(lostOf(text)[0].items)).toBe('an element from another namespace ("other:note")');
    const attr = ids(`    <specification name="A" ifcVersion="IFC4" other:tag="x" xmlns:other="urn:other"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability></specification>`);
    expect(sayLost(lostOf(attr)[0].items)).toBe('the attribute other:tag on a specification');
  });
  it('a processing instruction', () => {
    expect(sayLost(lostOf(ids(plain('A', '<?tool setting?>')))[0].items)).toBe('1 processing instruction');
  });
  it('an attribute the standard does not have, on a facet', () => {
    const text = ids(plain('A', '<attribute weight="3"><name><simpleValue>Name</simpleValue></name></attribute>'));
    expect(sayLost(lostOf(text)[0].items)).toBe('the attribute weight on an attribute facet');
  });
  it('several kinds at once, in one sentence', () => {
    const text = ids(plain('A', `<!-- c -->${enumReq('<xs:enumeration value="x" fixed="true"/>')}<?p q?>`));
    expect(sayLost(lostOf(text)[0].items)).toBe('1 comment, 1 processing instruction, the attribute fixed on a list value');
  });
  it('only the specifications that are written again, and the same list whatever the person typed', () => {
    const text = ids(plain('A', '<!-- in the first -->') + '\n' + plain('B', '<!-- in the second -->'));
    const { doc, k } = open(text);
    const a = writeKept(k, renameFirst(doc, 'Something else entirely'), nodeEnv).lost;
    const b = writeKept(k, { ...renameFirst(doc, 'X'), specifications: [{ ...doc.specifications[0], name: 'X', identifier: 'id-7' }, doc.specifications[1]] }, nodeEnv).lost;
    expect(a.map((p) => [p.part, sayLost(p.items)])).toEqual([[1, '1 comment']]);
    expect(b.map((p) => [p.part, sayLost(p.items)])).toEqual(a.map((p) => [p.part, sayLost(p.items)]));
    // Nothing changed: nothing is written again, and nothing is left out.
    expect(writeKept(k, doc, nodeEnv).lost).toEqual([]);
  });
  it('the About this IDS section when that is what changed', () => {
    const text = ids(plain('A'), '', '<info><!-- who --><title>T</title></info>');
    const { doc, k } = open(text);
    const w = writeKept(k, { ...doc, info: { ...doc.info, title: 'T2' } }, nodeEnv);
    expect(w.lost.map((p) => [p.part, p.name, sayLost(p.items)])).toEqual([['info', 'About this IDS', '1 comment']]);
  });
  it('white space and the schema\'s default values are not a loss', () => {
    const text = ids('    <specification name="A" ifcVersion="IFC4"><applicability maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification>');
    expect(lostOf(text)).toEqual([]);
  });
});

describe('what is left out when the whole file is written again', () => {
  it('lists comments before the root element and everywhere', () => {
    const text = ids(plain('A', '<!-- inside -->')).replace('?>\n', '?>\n<!-- before -->\n');
    const doc = quiet(() => readIdsText(text, nodeEnv));
    expect(sayLost(wholeLoss(text, doc, nodeEnv))).toBe('2 comments');
  });
});

describe('the pieces', () => {
  it('finds the root start tag and wraps a fragment in it', () => {
    const text = ids(plain('A'));
    const root = rootStartTag(text)!;
    expect(root.startsWith('<ids xmlns=')).toBe(true);
    expect(wrap(root, '<x/>').endsWith('<x/></ids>')).toBe(true);
    expect(lostBetween(wrap(root, '<specification name="a"><!--c--></specification>'), wrap(root, '<specification name="a"/>'), nodeEnv).map((i) => i.phrase)).toEqual(['1 comment']);
    expect(lostBetweenDocuments(text, text, nodeEnv)).toEqual([]);
  });
});

describe('the sentence next to Download', () => {
  it('names the specification by its place and its name, and lists what is left out', () => {
    expect(leftOutSentence({ part: 3, name: 'Fire rating', items: ['2 comments', 'the attribute fixed on a list value'] }))
      .toBe('Writing specification 3 ("Fire rating") again will leave out: 2 comments, the attribute fixed on a list value.');
    expect(leftOutSentence({ part: 'info', name: 'About this IDS', items: ['1 comment'] })).toBe('Writing "About this IDS" again will leave out: 1 comment.');
    expect(leftOutSentence({ part: 'file', name: 'a.ids', items: ['4 comments'] })).toBe('Writing this file again will leave out: 4 comments.');
  });
});
