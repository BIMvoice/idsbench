/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A model is checked one range of express ids at a time so that millions of elements are never held at once.
// A result must not depend on how the model was cut: here with a range of 2 ids against the whole model.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GroupAccumulator, capGroups, groupFailures } from '../src/core/groups';
import { readIds, runValidation } from '../src/core/validate';
import { failuresCsvParts } from '../src/core/csv';
import { reportParts } from '../src/core/format';
import type { FailingElement } from '../src/core/types';

const NS = 'http://standards.buildingsmart.org/IDS';
const line = (i: number, cls: string, name: string) => `#${i}=${cls}('${String(i).padStart(22, '0')}',$,'${name}',$,$,$,$,$,$);\n`;
const ifc = (body: string) => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
const req = (v: string) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements>`;
const spec = (name: string, cls: string, occurs: string, requirements = '') =>
  `<specification name="${name}" ifcVersion="IFC4"><applicability ${occurs}><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability>${requirements}</specification>`;
const ids = (...s: string[]) => `<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${s.join('')}</specifications></ids>`;
const run = (idsXml: string, body: string, rangeIds?: number) => {
  const u = new TextEncoder().encode(ifc(body));
  return runValidation({ ids: readIds(idsXml), idsName: 'a.ids', ifcBytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, ifcName: 'm.ifc', rangeIds });
};
const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

// Ten walls (ids 1..10), some of them named Waldo, three doors (ids 11..13), spread over several ranges of 2 ids.
const body = Array.from({ length: 10 }, (_, i) => line(i + 1, 'IFCWALL', i % 3 === 0 ? 'Waldo' : `Wall ${i + 1}`)).join('') + [11, 12, 13].map((i) => line(i, 'IFCDOOR', 'Door')).join('');
const MANY = 'minOccurs="1" maxOccurs="unbounded"';
const specs = [
  spec('walls named Waldo', 'IFCWALL', MANY, req('Waldo')),
  spec('all pass', 'IFCDOOR', MANY, req('Door')),
  spec('at most two doors', 'IFCDOOR', 'minOccurs="1" maxOccurs="2"', req('Door')),
  spec('no doors', 'IFCDOOR', 'minOccurs="0" maxOccurs="0"'),
  spec('at least one window', 'IFCWINDOW', MANY),
  spec('optional windows', 'IFCWINDOW', 'minOccurs="0" maxOccurs="unbounded"'),
  spec('exactly four walls named Waldo or not', 'IFCWALL', 'minOccurs="4" maxOccurs="4"'),
];
const strip = (r: Awaited<ReturnType<typeof run>>) => ({ ...r, seconds: 0 });

describe('the result does not depend on how the model is cut into ranges', () => {
  it('is the same for a range of 2 ids as for the whole model, specification by specification', async () => {
    const whole = await run(ids(...specs), body);
    const cut = await run(ids(...specs), body, 2);
    expect(strip(cut)).toEqual(strip(whole));
    // The cases are real ones: failing elements, a prohibited specification that matches, one that matches nothing, two whose number of matches IDS 1.0 does not have.
    expect(whole.specs.map((s) => [s.name, s.state, s.failureTotal])).toEqual([
      ['walls named Waldo', 'fail', 6], ['all pass', 'pass', 0], ['at most two doors', 'unchecked', 0], ['no doors', 'fail', 3],
      ['at least one window', 'fail', 0], ['optional windows', 'nothing', 0], ['exactly four walls named Waldo or not', 'unchecked', 0],
    ]);
  });
  it('gives the same downloads', async () => {
    const whole = await run(ids(...specs), body);
    const cut = await run(ids(...specs), body, 2);
    expect(await new Blob(failuresCsvParts(cut)).text()).toBe(await new Blob(failuresCsvParts(whole)).text());
    expect(await new Blob(reportParts({ ...cut, seconds: 0 })).text()).toBe(await new Blob(reportParts({ ...whole, seconds: 0 })).text());
  });
});

describe('the groups built one element at a time', () => {
  const el = (i: number, reasons: string[], own?: string): FailingElement => ({ ifcClass: 'IfcWall', name: `W${i}`, globalId: `g${i}`, reasons, ...(own ? { found: [own] } : {}) });
  const A = 'Property set "P" not found.';
  const list: FailingElement[] = Array.from({ length: 53 }, (_, i) => (i % 7 === 0 ? el(i, [A, 'Name is "x".']) : i % 3 === 0 ? el(i, []) : i % 5 === 0 ? el(i, [`Name is "n${i}", expected "Waldo".`], `n${i}`) : el(i, [A])));
  it.each([1, 4, 10, 200])('is what capGroups(groupFailures(all)) gives, for a cap of %i', (cap) => {
    const acc = new GroupAccumulator(cap);
    for (const f of list) acc.add(f);
    const expected = capGroups(groupFailures(list), cap);
    expect(acc.shown()).toEqual(expected);
  });
  it('counts every element, however many reasons there are, and says how many are not listed', () => {
    const acc = new GroupAccumulator(3);
    for (let i = 0; i < 6000; i++) acc.add(el(i, [`reason number ${i}`]));
    const { shown, notShown } = acc.shown();
    expect(acc.count).toBe(6000);
    expect(shown.reduce((n, g) => n + g.elements.length, 0) + notShown).toBe(6000);
  });
});

describe('failing elements put straight into the downloads', () => {
  // 450 walls that all fail: the result in the worker holds 200 of them and the downloads hold all 450.
  const many = Array.from({ length: 450 }, (_, i) => line(i + 1, 'IFCWALL', `Wall ${i + 1}`)).join('');
  const one = ids(spec('walls named Waldo', 'IFCWALL', MANY, req('Waldo')));
  const runSpill = (rangeIds?: number) => {
    const u = new TextEncoder().encode(ifc(many));
    return runValidation({ ids: readIds(one), idsName: 'a.ids', ifcBytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, ifcName: 'm.ifc', spill: true, rangeIds });
  };
  it('holds only what the page lists, with the exact count', async () => {
    const r = await runSpill();
    expect(r.specs[0].failures).toHaveLength(200);
    expect(r.specs[0].failureTotal).toBe(450);
    expect(r.specs[0].groups?.[0].total).toBe(450);
    expect(r.specs[0].notListed).toBe(250);
  });
  it('gives downloads equal to those of a result that holds every element, cut into ranges or not', async () => {
    const held = await run(one, many);
    for (const r of [await runSpill(), await runSpill(100)]) {
      expect(await new Blob(failuresCsvParts(r)).text()).toBe(await new Blob(failuresCsvParts(held)).text());
      const fromReport = JSON.parse(await new Blob(reportParts({ ...r, seconds: 0 })).text());
      const expected = JSON.parse(await new Blob(reportParts({ ...held, seconds: 0 })).text());
      expect(fromReport).toEqual(expected);
      expect(fromReport.specs[0].failures).toHaveLength(450);
    }
  });
});
