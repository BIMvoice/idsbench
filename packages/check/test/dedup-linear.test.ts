/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The schema check drops the "local list type" error that repeats the enumeration error on its line. It looked through
// every finding for each finding: 80,000 findings took 6.4 s on the page's own thread. Here they take well under a
// second, and what is dropped is what was dropped before.
import { describe, expect, it } from 'vitest';
import { interpret } from '../src/xsd.ts';

const enumeration = (line: number) =>
  `document.xml:${line}: Schemas validity error : Element '{http://standards.buildingsmart.org/IDS}specification', attribute 'ifcVersion': [facet 'enumeration'] The value 'IFC9' is not an element of the set {'IFC2X3', 'IFC4', 'IFC4X3_ADD2'}.`;
const listType = (line: number) =>
  `document.xml:${line}: Schemas validity error : Element '{http://standards.buildingsmart.org/IDS}specification', attribute 'ifcVersion': 'IFC9' is not a valid value of the local list type.`;

describe('the list type error that repeats the enumeration error', () => {
  it('is dropped for 160,000 findings in well under a second', () => {
    const N = 80_000;
    const raw = Array.from({ length: N }, (_, i) => `${enumeration(i + 1)}\n${listType(i + 1)}`).join('\n') + '\ndocument.xml fails to validate\n';
    const t = performance.now();
    const out = interpret(raw);
    const ms = performance.now() - t;
    expect(out.findings).toHaveLength(N);
    expect(out.findings.every((f) => f.message.includes('must be one of'))).toBe(true);
    console.log(`dedupe of ${2 * N} findings: ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(1000);
  });

  it('is dropped only when another invalid-value finding is on its line', () => {
    const raw = [enumeration(5), listType(5), listType(9), listType(12), listType(12), 'document.xml fails to validate', ''].join('\n');
    const kept = interpret(raw).findings.map((f) => `${f.line}:${f.message.includes('must be one of') ? 'enumeration' : 'list'}`);
    // Alone on line 9 it stays, and so do two on line 12: neither is an invalid-value finding of its own.
    expect(kept).toEqual(['5:enumeration', '9:list', '12:list', '12:list']);
  });
});
