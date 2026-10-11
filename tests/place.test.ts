// Where findings land, measured over every invalid file of the official corpus that ships with the Check package.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { readIdsText } from '../src/core/ids/read';
import { outline, placeFinding, placeFindings, targetOf } from '../src/core/place';
import { nodeEnv } from './helpers/dom';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', 'packages', 'check', 'test', 'fixtures', 'corpus');
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(d, f.name)) : [join(d, f.name)]));
const invalidFiles = walk(corpus).filter((f) => f.endsWith('.ids') && (/\/invalid-[^/]*$/.test(f) || f.includes('/InvalidFiles/'))).sort();

const XML = `<?xml version="1.0"?>
<ids xmlns="http://standards.buildingsmart.org/IDS">
  <!-- <specification name="in a comment"> -->
  <info>
    <title>t</title>
  </info>
  <specifications>
    <specification name="First" ifcVersion="IFC4">
      <applicability/>
    </specification>
    <ids:specification
        name='Second'>
    </ids:specification>
    <specification name="Third"/>
  </specifications>
</ids>`;

describe('outline', () => {
  it('finds the lines of the info section and of each specification, and skips comments', () => {
    const o = outline(XML);
    expect(o.info).toEqual({ from: 4, to: 6 });
    expect(o.specs).toEqual([{ from: 8, to: 10, name: 'First' }, { from: 11, to: 13, name: 'Second' }, { from: 14, to: 14, name: 'Third' }]);
  });
  it('counts CRLF as one line break and ignores a byte order mark', () => {
    expect(outline('﻿' + XML.replace(/\n/g, '\r\n')).specs.map((s) => s.from)).toEqual([8, 11, 14]);
  });
  it('still places specifications in a file that breaks off', () => {
    const o = outline(XML.slice(0, XML.indexOf('<ids:specification')));
    expect(o.specs).toEqual([{ from: 8, to: 10, name: 'First' }]);
  });
});

describe('placeFinding', () => {
  const o = outline(XML);
  it('uses the path of the engine first', () => {
    expect(placeFinding({ path: 'ids/specifications/specification[2]/applicability/entity/name', line: 1 }, o)).toEqual({ kind: 'specification', index: 1 });
    expect(placeFinding({ path: 'ids/specifications/specification/requirements', line: 1 }, o)).toEqual({ kind: 'specification', index: 0 });
    expect(placeFinding({ path: 'ids/info/author', line: 9 }, o)).toEqual({ kind: 'info' });
    expect(placeFinding({ path: 'ids/specifications', line: 9 }, o)).toEqual({ kind: 'file' });
    expect(placeFinding({ path: 'ids', line: 2 }, o)).toEqual({ kind: 'file' });
  });
  it('falls back to the line when there is no path, and to the file when there is neither', () => {
    expect(placeFinding({ line: 12 }, o)).toEqual({ kind: 'specification', index: 1 });
    expect(placeFinding({ line: 5 }, o)).toEqual({ kind: 'info' });
    expect(placeFinding({ line: 2 }, o)).toEqual({ kind: 'file' });
    expect(placeFinding({}, o)).toEqual({ kind: 'file' });
  });
});

describe('the official invalid files', () => {
  it('there are files to measure', () => expect(invalidFiles.length).toBe(66));

  it('every finding is placed exactly once, and the counts are the ones reported', async () => {
    const n = { findings: 0, spec: 0, info: 0, file: 0, field: 0, specOnly: 0, infoField: 0, fileOnly: 0, opened: 0, notOpened: 0 };
    for (const file of invalidFiles) {
      const xml = readFileSync(file, 'utf8');
      const r = await checkIds(xml);
      const o = outline(xml);
      const placed = placeFindings(r.findings, o);
      const inSpecs = [...placed.specs.values()].reduce((a, l) => a + l.length, 0);
      expect(placed.file.length + placed.info.length + inSpecs).toBe(r.findings.length);
      n.findings += r.findings.length; n.spec += inSpecs; n.info += placed.info.length; n.file += placed.file.length;
      // A finding placed on a specification names one that the file really has.
      for (const i of placed.specs.keys()) expect(i).toBeLessThan(Math.max(1, o.specs.length));
      let doc;
      try { doc = readIdsText(xml, nodeEnv); n.opened++; } catch { n.notOpened++; continue; }
      for (const f of r.findings) {
        const t = targetOf(f, doc, o);
        if (t.kind === 'field') {
          n.field++;
          // The key names something in that specification: the specification itself or one of its items.
          const s = doc.specifications[t.spec];
          const uids = [s.uid, ...s.applicability.map((x) => x.uid), ...s.requirements.map((x) => x.uid)];
          expect(uids).toContain(t.key.split('.')[0]);
        } else if (t.kind === 'specification') n.specOnly++;
        else if (t.kind === 'info') n.infoField++;
        else n.fileOnly++;
      }
    }
    console.log(`PLACEMENT over ${invalidFiles.length} invalid files: ${JSON.stringify(n)}`);
    expect(n).toEqual({ findings: 139, spec: 134, info: 0, file: 5, field: 116, specOnly: 0, infoField: 0, fileOnly: 0, opened: 57, notOpened: 9 });
  });
});

describe('where "Fix" leads for a "part of" item and for classes that exclude each other', () => {
  const partOf = (inner: string, attrs = '') => `<?xml version="1.0"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <info><title>t</title></info>
  <specifications>
    <specification name="S" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><partOf${attrs}><entity><name><simpleValue>IFCBUILDINGSTOREY</simpleValue></name>${inner}</entity></partOf></requirements>
    </specification>
  </specifications>
</ids>`;
  const targets = async (xml: string) => {
    const doc = readIdsText(xml, nodeEnv), o = outline(xml);
    const part = doc.specifications[0].requirements[0].uid, own = doc.specifications[0].uid;
    return (await checkIds(xml)).findings.map((f) => { const t = targetOf(f, doc, o); return `${f.code} -> ${t.kind === 'field' ? t.key.replace(part, 'partOf').replace(own, 'spec') : t.kind}`; });
  };
  it('a predefined type the class does not have leads to the predefined type, not to the class', async () => {
    expect(await targets(partOf('<predefinedType><simpleValue>BUNNARY</simpleValue></predefinedType>'))).toEqual(['entity-unknown-predefined-type -> partOf.predefinedType']);
  });
  it('a relation that is not allowed leads to the relation', async () => {
    expect(new Set(await targets(partOf('', ' relation="IFCRELFILLSELEMENT"')))).toEqual(new Set(['xsd-invalid-value -> partOf.relation', 'partof-relation-invalid -> partOf.relation']));
  });
  it('"Applies to" and "Must have" that can never describe the same element lead to "Must have", not to the name', async () => {
    const xml = partOf('').replace(/<requirements>.*<\/requirements>/, '<requirements><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></requirements>');
    expect(await targets(xml)).toEqual(['applicability-requirements-incompatible -> spec.requirements']);
  });
});
