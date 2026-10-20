/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Two deliveries of a model against the same IDS file (core/compare.ts): first on results made by hand, then on two
// variants of the example model run through the real engine, then the hand-over (CSV, report) and the page's section.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareDeliveries, comparisonCsvName, comparisonCsvParts, comparisonForReport, diffElements, specChange, COMPARE_COLUMNS, type Comparison } from '../src/core/compare';
import { parseCsv } from '../src/core/csv';
import { EXAMPLE_IDS, EXAMPLE_IFC } from '../src/core/example';
import { reportParts } from '../src/core/format';
import { pageReportParts } from '../src/core/report';
import type { FailingElement, RunResult, SpecRow, SpecState } from '../src/core/types';
import { Compare } from '../src/ui/page/Compare';
import { runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

// ---- results made by hand ----
const el = (globalId: string | null, name = `Wall ${globalId}`, reasons = ['It has no fire rating.']): FailingElement => ({ ifcClass: 'IfcWall', name, globalId, reasons });
const row = (name: string, state: SpecState, failures: FailingElement[] = []): SpecRow => ({
  name, state, kind: 'required', applicable: failures.length, passed: 0, failed: failures.length, summary: '', note: null, schemaNote: null, failures, failureTotal: failures.length,
});
const result = (file: string, specs: SpecRow[], globalIds: string[]): RunResult => ({
  idsFile: 'a.ids', ifcFile: file, schema: 'IFC4', entityCount: globalIds.length, specs,
  counts: { specifications: specs.length, passed: 0, failed: 0, notChecked: 0, nothingToCheck: 0 }, headline: '', verdict: 'fail', allPassed: false, seconds: 0,
  // Made by hand, every element of the model is one the specification applies to.
  keys: { globalIds, failing: specs.map((s) => s.failures), applicable: specs.map(() => globalIds) },
});
const ids = (c: Comparison, i: number, change: string) => c.specs[i].elements.filter((e) => e.change === change).map((e) => e.element.globalId);

describe('how the state of a specification changed', () => {
  it('pass to fail, fail to pass, fail to fail, pass to pass', () => {
    expect(specChange(row('s', 'pass'), row('s', 'fail'))).toBe('now-fails');
    expect(specChange(row('s', 'fail'), row('s', 'pass'))).toBe('now-passes');
    expect(specChange(row('s', 'fail'), row('s', 'fail'))).toBe('still-fails');
    expect(specChange(row('s', 'pass'), row('s', 'pass'))).toBe('still-passes');
  });
  it('Nothing to check counts as a pass, as in the headline of a run', () => {
    expect(specChange(row('s', 'nothing'), row('s', 'fail'))).toBe('now-fails');
    expect(specChange(row('s', 'fail'), row('s', 'nothing'))).toBe('now-passes');
    expect(specChange(row('s', 'nothing'), row('s', 'pass'))).toBe('still-passes');
  });
  it('not checked in either one is "not checked", whatever the other says', () => {
    expect(specChange(row('s', 'unchecked'), row('s', 'fail'))).toBe('not-checked');
    expect(specChange(row('s', 'pass'), row('s', 'unchecked'))).toBe('not-checked');
  });
  it('in one result only', () => {
    expect(specChange(null, row('s', 'fail'))).toBe('not-in-both');
    expect(specChange(row('s', 'fail'), null)).toBe('not-in-both');
  });
});

describe('the failing elements of one specification, matched by GlobalId', () => {
  const before = [el('A'), el('B'), el('C')];
  const after = [el('A'), el('D'), el('E')];
  const earlierIds = new Set(['A', 'B', 'C', 'D']);
  const laterIds = new Set(['A', 'B', 'D', 'E']);
  const { elements } = diffElements(before, after, { earlierIds, laterIds, earlierApplicable: earlierIds, laterApplicable: laterIds });
  const of = (k: string) => elements.filter((e) => e.change === k).map((e) => e.element.globalId);
  it('an element that fails no more and is still in the model is fixed', () => expect(of('fixed')).toEqual(['B']));
  it('an element that fails no more and is not in the model any more is removed, not fixed', () => expect(of('removed')).toEqual(['C']));
  it('an element of the earlier model that fails now is a new failure', () => expect(of('new-failure')).toEqual(['D']));
  it('an element the earlier model did not have, failing now, is a new element', () => expect(of('new-element')).toEqual(['E']));
  it('an element that fails in both is still failing', () => expect(of('still-failing')).toEqual(['A']));
  it('elements are matched by GlobalId, not by name: a renamed element that still fails is still failing', () => {
    const d = diffElements([el('A', 'Old name')], [el('A', 'New name')], { earlierIds: new Set(['A']), laterIds: new Set(['A']), earlierApplicable: new Set(['A']), laterApplicable: new Set(['A']) });
    expect(d.elements.map((e) => e.change)).toEqual(['still-failing']);
    expect(d.elements[0].element.name).toBe('New name');
  });
  it('two elements with the same name and other GlobalIds are two elements', () => {
    const d = diffElements([el('A', 'Same')], [el('B', 'Same')], { earlierIds: new Set(['A', 'B']), laterIds: new Set(['A', 'B']), earlierApplicable: new Set(['A', 'B']), laterApplicable: new Set(['A', 'B']) });
    expect(d.elements.map((e) => `${e.change}:${e.element.globalId}`).sort()).toEqual(['fixed:A', 'new-failure:B']);
  });
  it('a failing element without a GlobalId cannot be matched: counted, never called fixed or new', () => {
    const d = diffElements([el(null, 'x')], [el(null, 'x')], { earlierIds: new Set(), laterIds: new Set(), earlierApplicable: new Set(), laterApplicable: new Set() });
    expect(d.elements).toEqual([]);
    expect(d.noGlobalId).toBe(2);
  });
});

describe('two results made by hand', () => {
  const earlier = result('v1.ifc', [
    row('Walls have a fire rating', 'fail', [el('A'), el('B'), el('C')]),
    row('Walls have a name', 'pass'),
    row('Doors are classified', 'fail', [el('D1')]),
    row('Slabs', 'unchecked'),
    row('Spaces', 'pass'),
  ], ['A', 'B', 'C', 'D1', 'S1']);
  const later = result('v2.ifc', [
    row('Walls have a fire rating', 'fail', [el('A'), el('N')]),
    row('Walls have a name', 'fail', [el('B')]),
    row('Doors are classified', 'pass'),
    row('Slabs', 'fail', [el('S1')]),
    row('Spaces', 'nothing'),
  ], ['A', 'B', 'D1', 'N', 'S1']);
  const c = compareDeliveries(earlier, later);
  it('one change per specification, in the order of the IDS file', () =>
    expect(c.specs.map((s) => s.change)).toEqual(['still-fails', 'now-fails', 'now-passes', 'not-checked', 'still-passes']));
  it('the headline counts them', () => {
    expect(c.counts).toMatchObject({ 'now-passes': 1, 'now-fails': 1, 'still-fails': 1, 'still-passes': 1, 'not-checked': 1, 'not-in-both': 0 });
    expect(c.headline).toBe('v2.ifc against v1.ifc: 1 specification now passes, 1 now fails, 1 still fails and 1 still passes. 1 specification was not checked in one of the two or both.');
  });
  it('still failing: the element counts before and now, and which elements', () => {
    expect(c.specs[0]).toMatchObject({ failedBefore: 3, failedAfter: 2 });
    expect(ids(c, 0, 'fixed')).toEqual(['B']);
    expect(ids(c, 0, 'removed')).toEqual(['C']);
    expect(ids(c, 0, 'new-element')).toEqual(['N']);
    expect(ids(c, 0, 'still-failing')).toEqual(['A']);
    expect(c.specs[0].summary).toBe('Fails in both. Failing elements: 3 before, 2 now. 1 fixed, 1 removed from the model, 1 new failure (a new element) and 1 still failing.');
  });
  it('pass to fail: the element that fails now is a new failure of an element that was there', () => expect(ids(c, 1, 'new-failure')).toEqual(['B']));
  it('fail to pass: the element that failed is fixed', () => expect(ids(c, 2, 'fixed')).toEqual(['D1']));
  it('not checked in one of them: no element is compared', () => {
    expect(c.specs[3].elements).toEqual([]);
    expect(c.specs[3].summary).toBe('Not checked in the earlier delivery, so there is nothing to compare.');
  });
  it('over all specifications', () => expect(c.elements).toEqual({ fixed: 2, 'no-longer-checked': 0, removed: 1, 'new-failure': 1, 'newly-checked': 0, 'new-element': 1, 'still-failing': 1 }));

  it('a specification in one result only (the IDS file is the same, so this should not happen) is said, and nothing is matched by guess', () => {
    const one = result('v1.ifc', [row('Kept', 'fail', [el('A')]), row('Gone', 'fail', [el('B')])], ['A', 'B']);
    const two = result('v2.ifc', [row('Kept', 'fail', [el('A')]), row('Added', 'fail', [el('B')])], ['A', 'B']);
    const d = compareDeliveries(one, two);
    expect(d.specs.map((s) => `${s.name}:${s.change}`)).toEqual(['Kept:still-fails', 'Gone:not-in-both', 'Added:not-in-both']);
    expect(d.specs[1].elements).toEqual([]);
    expect(d.counts['not-in-both']).toBe(2);
    expect(d.headline).toContain('2 specifications are in one result only.');
  });
  it('specifications in another order are matched by name', () => {
    const one = result('v1.ifc', [row('X', 'fail', [el('A')]), row('Y', 'pass'), row('Z', 'pass')], ['A']);
    const two = result('v2.ifc', [row('Y', 'pass'), row('X', 'pass'), row('W', 'pass')], ['A']);
    const d = compareDeliveries(one, two);
    expect(d.specs.map((s) => `${s.name}:${s.change}`)).toEqual(['X:now-passes', 'Y:still-passes', 'Z:not-in-both', 'W:not-in-both']);
    expect(ids(d, 0, 'fixed')).toEqual(['A']);
  });
  it('a run made without collecting is refused, not compared with half the elements', () => {
    const { keys: _k, ...bare } = earlier;
    expect(() => compareDeliveries(bare as RunResult, later)).toThrow();
  });
});

// ---- two deliveries of the example model, through the engine ----
// v1 is the example: walls 1 and 2 have a fire rating, 3 and 4 do not; every wall has a name; no door.
// v2: wall 3 gets a fire rating (fixed), wall 4 is deleted (removed), wall 5 is added without one (new element), and
// wall 2 loses its name (it now fails "Walls have a name", which passed). Then a door without a classification.
const V1 = EXAMPLE_IFC;
const V2 = EXAMPLE_IFC
  .replace("#2=IFCWALL('0aExampleWall000000002',$,'Wall east',", "#2=IFCWALL('0aExampleWall000000002',$,$,")
  .replace("#4=IFCWALL('0aExampleWall000000004',$,'Wall west',$,$,$,$,$,$);\n", "#5=IFCWALL('0aExampleWall000000005',$,'Wall new',$,$,$,$,$,$);\n#6=IFCDOOR('0aExampleDoor000000001',$,'Door 1',$,$,$,$,$,$,$,$,$,$);\n")
  .replace('(#1,#2),#11);', '(#1,#2,#3),#11);');

describe('two variants of the example model, run by the engine', () => {
  let v1: RunResult, v2: RunResult;
  beforeAll(async () => {
    expect(V2).not.toBe(V1);
    expect(V2).toContain("#5=IFCWALL(");
    expect(V2).not.toContain("0aExampleWall000000004");
    v1 = await runText(EXAMPLE_IDS, V1, { collect: true });
    v2 = await runText(EXAMPLE_IDS, V2, { collect: true });
  });
  it('the runs collect every failing element and every GlobalId', () => {
    expect(v1.keys!.globalIds).toContain('0aExampleWall000000004');
    expect(v2.keys!.globalIds).not.toContain('0aExampleWall000000004');
    expect(v2.keys!.globalIds).toContain('0aExampleWall000000005');
    expect(v1.keys!.failing.map((l) => l.length)).toEqual([2, 0, 0]);
  });
  it('v2 against v1: counts and elements', () => {
    const c = compareDeliveries(v1, v2);
    expect(c.specs.map((s) => s.change)).toEqual(['still-fails', 'now-fails', 'now-fails']);
    expect(c.headline).toBe('m.ifc against m.ifc: 2 specifications now fail and 1 still fails.');
    expect(c.specs[0]).toMatchObject({ failedBefore: 2, failedAfter: 1 });
    expect(ids(c, 0, 'fixed')).toEqual(['0aExampleWall000000003']);
    expect(ids(c, 0, 'removed')).toEqual(['0aExampleWall000000004']);
    expect(ids(c, 0, 'new-element')).toEqual(['0aExampleWall000000005']);
    expect(ids(c, 0, 'still-failing')).toEqual([]);
    expect(ids(c, 1, 'new-failure')).toEqual(['0aExampleWall000000002']);
    expect(ids(c, 2, 'new-element')).toEqual(['0aExampleDoor000000001']);
    expect(c.elements).toEqual({ fixed: 1, 'no-longer-checked': 0, removed: 1, 'new-failure': 1, 'newly-checked': 0, 'new-element': 2, 'still-failing': 0 });
  });
  it('v1 against v2 (the other way round): the name is back, so that specification now passes', () => {
    const c = compareDeliveries(v2, v1);
    expect(c.specs.map((s) => s.change)).toEqual(['still-fails', 'now-passes', 'now-passes']);
    expect(ids(c, 1, 'fixed')).toEqual(['0aExampleWall000000002']);
    expect(ids(c, 0, 'removed')).toEqual(['0aExampleWall000000005']);
    expect(ids(c, 0, 'new-failure')).toEqual(['0aExampleWall000000003']);
    expect(ids(c, 0, 'new-element')).toEqual(['0aExampleWall000000004']);
    expect(ids(c, 2, 'removed')).toEqual(['0aExampleDoor000000001']);
  });
  it('the same model twice: nothing changed', () => {
    const c = compareDeliveries(v1, v1);
    expect(c.specs.map((s) => s.change)).toEqual(['still-fails', 'still-passes', 'still-passes']);
    expect(c.elements).toEqual({ fixed: 0, 'no-longer-checked': 0, removed: 0, 'new-failure': 0, 'newly-checked': 0, 'new-element': 0, 'still-failing': 2 });
  });
  it('a run in many ranges collects the same', async () => {
    const parts = await runText(EXAMPLE_IDS, V2, { collect: true, rangeIds: 2 });
    expect(new Set(parts.keys!.globalIds)).toEqual(new Set(v2.keys!.globalIds));
    expect(compareDeliveries(v1, parts).elements).toEqual(compareDeliveries(v1, v2).elements);
  });
  it('the elements are listed by the worker beyond what the page holds: collect keeps all, spill or not', async () => {
    const spilled = await runText(EXAMPLE_IDS, V2, { collect: true, spill: true });
    expect(spilled.keys!.failing).toEqual(v2.keys!.failing);
  });
});

describe('one model and no earlier delivery: the run is the run it was', () => {
  it('a run that is not asked to collect has no keys, and collecting changes nothing else', async () => {
    const plain = await runText(EXAMPLE_IDS, V2, { spill: true });
    const collected = await runText(EXAMPLE_IDS, V2, { spill: true, collect: true });
    expect('keys' in plain).toBe(false);
    const { keys: _k, ...rest } = collected;
    const strip = (r: Omit<RunResult, 'keys'>) => ({ ...r, seconds: 0, spilled: undefined });
    expect(strip(rest)).toEqual(strip(plain));
  });
  it('the report of a run does not hold the keys', async () => {
    const collected = await runText(EXAMPLE_IDS, V2, { collect: true });
    const text = reportParts(collected).join('');
    expect(text).not.toContain('"keys"');
    expect(text).toBe(reportParts({ ...collected, keys: undefined }).join(''));
  });
  it('the page report without a comparison is byte for byte what it was', () => {
    const check = { kind: 'report', valid: true, version: '1.0', errors: 0, warnings: 0, findings: [], headline: '' } as unknown as Parameters<typeof pageReportParts>[2];
    const model = { name: 'm.ifc', bytes: 10, sha256: 'ab' };
    const before = pageReportParts('a.ids', false, check, null, null, model, []).join('');
    expect(pageReportParts('a.ids', false, check, null, null, model, [], null).join('')).toBe(before);
    expect(before).not.toContain('earlierModel');
    expect(before).not.toContain('comparison');
  });
});

describe('the hand-over', () => {
  let c: Comparison, v1: RunResult, v2: RunResult;
  beforeAll(async () => {
    v1 = await runText(EXAMPLE_IDS, V1, { collect: true });
    v2 = await runText(EXAMPLE_IDS, V2.replace("'Wall new'", "'=HYPERLINK(\"x\")'"), { collect: true });
    c = compareDeliveries({ ...v1, ifcFile: 'v1.ifc' }, { ...v2, ifcFile: 'v2.ifc' });
  });
  it('the CSV: one row per specification and one per changed element, Excel-safe', () => {
    const text = comparisonCsvParts(c, 'req.ids').join('');
    expect(text.startsWith('﻿')).toBe(true);
    expect(text.includes('\r\n')).toBe(true);
    const rows = parseCsv(text);
    expect(rows[0]).toEqual([...COMPARE_COLUMNS]);
    const body = rows.slice(1).filter((r) => r.length > 1);
    expect(body.filter((r) => r[0] === 'Specification').map((r) => r[1])).toEqual(['Still fails', 'Now fails', 'Now fails']);
    expect(body.filter((r) => r[0] === 'Element').map((r) => `${r[1]}|${r[8]}`)).toEqual([
      'Fixed|0aExampleWall000000003',
      'Element removed|0aExampleWall000000004',
      'New element, failing|0aExampleWall000000005',
      'New failure|0aExampleWall000000002',
      'New element, failing|0aExampleDoor000000001',
    ]);
    // A name a spreadsheet would run as a formula gets an apostrophe in front.
    expect(body.find((r) => r[8] === '0aExampleWall000000005')![7]).toBe('\'=HYPERLINK("x")');
    for (const r of body) expect(r.slice(10)).toEqual(['v1.ifc', 'v2.ifc', 'req.ids']);
    // A fixed element says why it failed before; what to fix is only said of an element that fails now.
    const fixed = body.find((r) => r[1] === 'Fixed')!;
    expect(fixed[4].startsWith('It failed before: ')).toBe(true);
    expect(fixed[5]).toBe('');
  });
  it('the CSV name names both models', () => expect(comparisonCsvName(c)).toBe('v2-compared-with-v1.csv'));
  it('the report names both models by name, size and SHA-256, and holds the comparison', () => {
    const check = { kind: 'report', valid: true, version: '1.0', errors: 0, warnings: 0, findings: [], headline: '' } as unknown as Parameters<typeof pageReportParts>[2];
    const text = pageReportParts('req.ids', false, check, v2, null, { name: 'v2.ifc', bytes: 20, sha256: 'bb' }, [], { earlierModel: { name: 'v1.ifc', bytes: 10, sha256: 'aa' }, comparison: comparisonForReport(c) }).join('');
    const json = JSON.parse(text);
    expect(json.model).toEqual({ name: 'v2.ifc', bytes: 20, sha256: 'bb' });
    expect(json.earlierModel).toEqual({ name: 'v1.ifc', bytes: 10, sha256: 'aa' });
    expect(json.comparison.headline).toBe(c.headline);
    expect(json.comparison.specs[0].elements.map((e: { change: string }) => e.change)).toEqual(['fixed', 'removed', 'new-element']);
    expect(json.run.keys).toBeUndefined();
  });
});

describe('the section on the page', () => {
  it('names both files with their size and SHA-256, the headline, each specification\'s change and the elements by change', async () => {
    const v1 = await runText(EXAMPLE_IDS, V1, { collect: true });
    const v2 = await runText(EXAMPLE_IDS, V2, { collect: true });
    const c = compareDeliveries({ ...v1, ifcFile: 'v1.ifc' }, { ...v2, ifcFile: 'v2.ifc' });
    const html = renderToStaticMarkup(createElement(Compare, { comparison: c, earlierBytes: { bytes: 2048, sha256: 'aa11' }, laterBytes: { bytes: 4096, sha256: 'bb22' }, working: false, error: null, onDownload: () => {}, onRunAgain: () => {} }));
    for (const s of ['v1.ifc', 'v2.ifc', '2.0 KB', '4.0 KB', 'aa11', 'bb22', c.headline, 'Still fails', 'Now fails', 'Download the comparison', 'Fixed: 1 element', 'Element removed: 1 element', 'New element, failing: 1 element', '0aExampleWall000000004']) {
      expect(html).toContain(s.replace(/"/g, '&quot;'));
    }
    // Buttons and disclosures are real buttons and summaries: reachable and pressable from the keyboard.
    expect(html).toMatch(/<button type="button"[^>]*>Download the comparison<\/button>/);
    expect(html).toContain('<summary>Show the');
  });
  it('while the earlier delivery runs, and when it cannot be read', () => {
    const working = renderToStaticMarkup(createElement(Compare, { comparison: null, earlierBytes: null, laterBytes: null, working: true, error: null, onDownload: () => {}, onRunAgain: () => {} }));
    expect(working).toContain('Checking the earlier delivery');
    const failed = renderToStaticMarkup(createElement(Compare, { comparison: null, earlierBytes: null, laterBytes: null, working: false, error: 'The file is zipped.', onDownload: () => {}, onRunAgain: () => {} }));
    expect(failed).toContain('The earlier delivery could not be checked. The file is zipped.');
    expect(failed).toContain('Run again');
  });
});

// ---- review finding 1: "fixed" means the element is checked by the specification now and passes it ----
const PROHIBITED_WALLS = EXAMPLE_IDS.replace(/<specification name="Walls have a name"[\s\S]*?<\/specification>/, `<specification name="No walls" ifcVersion="IFC4">
      <applicability minOccurs="0" maxOccurs="0">
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
    </specification>`);
const toSlab = (model: string, n: number) => model.replace(`#${n}=IFCWALL('0aExampleWall00000000${n}',$,'`, `#${n}=IFCSLAB('0aExampleWall00000000${n}',$,'`);
const onlyFireRating = (ids: string) => ids.replace(/<specification name="Walls have a name"[\s\S]*?<\/specification>/, '').replace(/<specification name="Doors are classified"[\s\S]*?<\/specification>/, '');
const optional = (ids: string) => ids.replace('<applicability minOccurs="1" maxOccurs="unbounded">', '<applicability minOccurs="0" maxOccurs="unbounded">');

describe('an element that no longer fails is fixed only when the specification checks it now and it passes', () => {
  it('a failing wall made a slab with the same GlobalId is no longer checked by the specification, not fixed', async () => {
    const v1 = await runText(onlyFireRating(EXAMPLE_IDS), V1, { collect: true });
    const v2 = await runText(onlyFireRating(EXAMPLE_IDS), toSlab(V1, 3), { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(ids(c, 0, 'fixed')).toEqual([]);
    expect(ids(c, 0, 'no-longer-checked')).toEqual(['0aExampleWall000000003']);
    expect(c.elementLine).toContain('1 no longer checked by this specification');
  });
  it('two failing walls made slabs, optional specification: it now passes with nothing fixed', async () => {
    const ids_ = optional(onlyFireRating(EXAMPLE_IDS));
    const v1 = await runText(ids_, V1, { collect: true });
    const v2 = await runText(ids_, toSlab(toSlab(V1, 3), 4), { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(c.specs[0].change).toBe('now-passes');
    expect(c.specs[0].counts.fixed).toBe(0);
    expect(ids(c, 0, 'no-longer-checked')).toEqual(['0aExampleWall000000003', '0aExampleWall000000004']);
  });
  it('a required specification that matches nothing any more fails as a whole, with nothing fixed', async () => {
    const ids_ = onlyFireRating(EXAMPLE_IDS);
    const v1 = await runText(ids_, V1, { collect: true });
    const v2 = await runText(ids_, toSlab(toSlab(toSlab(toSlab(V1, 1), 2), 3), 4), { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(c.specs[0].change).toBe('still-fails');
    expect(c.specs[0].counts.fixed).toBe(0);
    expect(c.specs[0].summary).not.toMatch(/fixed/);
    expect(c.specs[0].counts['no-longer-checked']).toBe(2);
  });
  it('a prohibited specification: a wall made a slab is no longer checked, not fixed', async () => {
    const v1 = await runText(PROHIBITED_WALLS, V1, { collect: true });
    const v2 = await runText(PROHIBITED_WALLS, toSlab(V1, 4), { collect: true });
    const c = compareDeliveries(v1, v2);
    const i = c.specs.findIndex((s) => s.name === 'No walls');
    expect(ids(c, i, 'fixed')).toEqual([]);
    expect(ids(c, i, 'no-longer-checked')).toEqual(['0aExampleWall000000004']);
    expect(ids(c, i, 'still-failing')).toHaveLength(3);
  });
  it('the other way round: a slab made a failing wall is newly checked, not a new failure of an element that passed', async () => {
    const ids_ = onlyFireRating(EXAMPLE_IDS);
    const v1 = await runText(ids_, toSlab(V1, 3), { collect: true });
    const v2 = await runText(ids_, V1, { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(ids(c, 0, 'new-failure')).toEqual([]);
    expect(ids(c, 0, 'newly-checked')).toEqual(['0aExampleWall000000003']);
  });
  it('a wall that gets its fire rating is fixed (it is checked now and passes)', async () => {
    const ids_ = onlyFireRating(EXAMPLE_IDS);
    const v1 = await runText(ids_, V1, { collect: true });
    const v2 = await runText(ids_, V1.replace('(#1,#2),#11);', '(#1,#2,#3),#11);'), { collect: true });
    expect(ids(compareDeliveries(v1, v2), 0, 'fixed')).toEqual(['0aExampleWall000000003']);
  });
});

describe('the diff function with what each specification applies to', () => {
  const ctx = { earlierIds: new Set(['F', 'N', 'R', 'P', 'S']), laterIds: new Set(['F', 'N', 'P', 'S', 'E']), earlierApplicable: new Set(['F', 'N', 'R', 'P']), laterApplicable: new Set(['F', 'P', 'S', 'E']) };
  const { elements } = diffElements([el('F'), el('N'), el('R')], [el('P'), el('S'), el('E')], ctx);
  const of = (k: string) => elements.filter((e) => e.change === k).map((e) => e.element.globalId);
  it('applies now and does not fail: fixed', () => expect(of('fixed')).toEqual(['F']));
  it('in the model, not applied to now: no longer checked', () => expect(of('no-longer-checked')).toEqual(['N']));
  it('not in the model: removed', () => expect(of('removed')).toEqual(['R']));
  it('applied to before and passed: new failure', () => expect(of('new-failure')).toEqual(['P']));
  it('in the earlier model, not applied to before: newly checked', () => expect(of('newly-checked')).toEqual(['S']));
  it('not in the earlier model: new element', () => expect(of('new-element')).toEqual(['E']));
});

// ---- review finding 3: two elements with one GlobalId ----
describe('two elements that share a GlobalId are not matched by it', () => {
  const ids_ = onlyFireRating(EXAMPLE_IDS);
  // Walls 3 and 4 both fail the fire rating and carry the same GlobalId (an invalid file, but one that is delivered).
  const shared = V1.replace("#4=IFCWALL('0aExampleWall000000004'", "#4=IFCWALL('0aExampleWall000000003'");
  const rated = (model: string, walls: string) => model.replace('(#1,#2),#11);', `(#1,#2,${walls}),#11);`);
  it('one of the two fixed: neither is called fixed nor still failing; both deliveries\' elements are counted and said', async () => {
    const v1 = await runText(ids_, shared, { collect: true });
    const v2 = await runText(ids_, rated(shared, '#3'), { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(c.specs[0].elements.filter((e) => e.element.globalId === '0aExampleWall000000003')).toEqual([]);
    expect(c.specs[0].duplicateGlobalId).toBe(3);
    expect(c.specs[0].summary).toContain('3 failing elements (in either delivery) share a GlobalId with another element of the model');
  });
  it('both fixed: not counted twice as fixed', async () => {
    const v1 = await runText(ids_, shared, { collect: true });
    const v2 = await runText(ids_, rated(shared, '#3,#4'), { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(c.specs[0].counts.fixed).toBe(0);
    expect(c.specs[0].duplicateGlobalId).toBe(2);
    expect(c.elementLine).toContain('2 failing elements (in either delivery) share a GlobalId with another element of the model');
  });
  it('a GlobalId shared in the later model only is not matched either', async () => {
    const v1 = await runText(ids_, V1, { collect: true });
    const v2 = await runText(ids_, shared, { collect: true });
    const c = compareDeliveries(v1, v2);
    expect(c.specs[0].elements.filter((e) => e.element.globalId === '0aExampleWall000000003')).toEqual([]);
    expect(c.specs[0].duplicateGlobalId).toBe(3);
  });
  it('a GlobalId shared in only one of the two models is not matched either', () => {
    const d = diffElements([el('X', 'a')], [el('X', 'b')], { earlierIds: new Set(['X']), laterIds: new Set(['X']), earlierApplicable: new Set(['X']), laterApplicable: new Set(['X']), duplicates: new Set(['X']) });
    expect(d.elements).toEqual([]);
    expect(d.duplicateGlobalId).toBe(2);
  });
});
