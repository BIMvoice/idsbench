/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The page reads an IDS file of up to 100 MB, and the schema validator was given at most 128 MB of memory: a valid
// file of 30 MB ran it out of memory, and that was reported as a fault in the file ("Not valid", Download off, Run
// refused). Here valid files of 15, 30 and 64 MB are valid, with the memory the validator is now given for them; and a
// validator that runs out of memory gives no verdict at all, instead of a finding.
import { describe, it, expect } from 'vitest';
import { memoryPages } from 'xmllint-wasm';
import { memoryPagesFor, validateAgainstXsd, ValidatorFailed } from '../src/xsd.ts';
import { NS } from './helpers.ts';

const MB = 1024 * 1024;
/** A valid IDS 1.0 file of about this many megabytes, of plain specifications (what scripts/make-large-ids.mjs writes). */
function largeIds(mb: number): string {
  const classes = ['IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCROOF', 'IFCSTAIR'];
  const specs: string[] = [];
  let size = 0;
  for (let i = 1; size < mb * MB; i++) {
    const cls = classes[i % classes.length];
    const s = `    <specification name="Specification ${i}" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity><name><simpleValue>${cls}</simpleValue></name></entity>
      </applicability>
      <requirements>
        <attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="[A-Z]{2}-[0-9]+"/></xs:restriction></value></attribute>
        <property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>Status</simpleValue></baseName></property>
      </requirements>
    </specification>
`;
    specs.push(s);
    size += s.length;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd">
  <info><title>Large</title></info>
  <specifications>
${specs.join('')}  </specifications>
</ids>
`;
}

describe('a large valid IDS file', () => {
  for (const mb of [15, 30, 64]) {
    it(`of ${mb} MB is valid`, async () => {
      const xml = largeIds(mb);
      expect(xml.length).toBeGreaterThan(mb * MB);
      const t = performance.now();
      const out = await validateAgainstXsd(xml);
      const ms = performance.now() - t;
      expect(out).toEqual({ notWellFormed: false, findings: [] });
      console.log(`${mb} MB: schema check ${Math.round(ms)} ms, memory ceiling ${Math.round(memoryPagesFor(xml.length) / memoryPages.MiB)} MiB`);
    });
  }

  it('gives no verdict when the validator runs out of memory: it throws, it does not report a finding', async () => {
    const xml = largeIds(15);
    // 64 MiB, less than the 72 MiB a file of 15 MB was measured to need.
    const failed = await validateAgainstXsd(xml, undefined, { maxMemoryPages: 64 * memoryPages.MiB }).then(() => null, (e: unknown) => e);
    expect(failed).toBeInstanceOf(ValidatorFailed);
    expect((failed as ValidatorFailed).outOfMemory).toBe(true);
    expect((failed as Error).message).toMatch(/out of memory/);
  });
});

describe('the memory the validator may take', () => {
  it('grows with the file: sixteen times the file and 32 MiB, at most the 4 GiB WebAssembly allows', () => {
    expect(memoryPagesFor(0)).toBe(32 * memoryPages.MiB);
    expect(memoryPagesFor(30 * MB)).toBe((32 + 16 * 30) * memoryPages.MiB);
    // The largest file the page reads (100 MB), with room to spare.
    expect(memoryPagesFor(100 * MB)).toBe((32 + 1600) * memoryPages.MiB);
    expect(memoryPagesFor(100 * MB)).toBeLessThan(memoryPages.max);
    expect(memoryPagesFor(1024 * MB)).toBe(memoryPages.max);
  });
});
