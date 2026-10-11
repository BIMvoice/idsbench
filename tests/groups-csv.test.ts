import { describe, expect, it } from 'vitest';
import { csvCell, failureCount, failuresCsvName, failuresCsvParts, CSV_COLUMNS } from '../src/core/csv';
import { capGroups, groupFailures, NO_REASON } from '../src/core/groups';
import { pageReportName, pageReportParts } from '../src/core/report';
import { kindOfFile } from '../src/core/sniff';
import type { FailingElement, RunResult, SpecRow } from '../src/core/types';

const el = (name: string | null, reasons: string[], id: string | null = `id-${name}`): FailingElement => ({ ifcClass: 'IfcWall', name, globalId: id, reasons });
const A = 'Property set "Pset_WallCommon" not found.', B = 'Name is not "Waldo".';
const failures = [el('1', [A]), el('2', [B]), el('3', [A]), el('4', [A, B]), el('5', []), el('6', [A])];

describe('groupFailures', () => {
  const groups = groupFailures(failures);
  it('makes one group per distinct set of reasons, in order of first appearance', () => {
    expect(groups.map((g) => [g.reason, g.elements.map((e) => e.name)])).toEqual([
      [A, ['1', '3', '6']], [B, ['2']], [`${A} ${B}`, ['4']], [NO_REASON, ['5']],
    ]);
  });
  it('puts every element in exactly one group, so the counts add up', () => {
    expect(groups.reduce((n, g) => n + g.elements.length, 0)).toBe(failures.length);
    expect(new Set(groups.flatMap((g) => g.elements)).size).toBe(failures.length);
  });
  it('is empty for no failures', () => expect(groupFailures([])).toEqual([]));
  it('caps what is listed and says how many are left out, keeping each group\'s full count', () => {
    const { shown, notShown } = capGroups(groups, 4);
    expect(shown.map((g) => [g.elements.length, g.total])).toEqual([[3, 3], [1, 1]]);
    expect(notShown).toBe(2);
    expect(capGroups(groups, 100).notShown).toBe(0);
  });
});

const spec = (name: string, f: FailingElement[]): SpecRow => ({ name, state: f.length ? 'fail' : 'pass', kind: 'required', applicable: 9, passed: 9 - f.length, failed: f.length, summary: '', note: null, schemaNote: null, failures: f });
const result = (specs: SpecRow[]): RunResult => ({
  idsFile: 'req.ids', ifcFile: 'Tower, east.ifc', schema: 'IFC4', entityCount: 10, specs,
  counts: { specifications: specs.length, passed: 0, failed: 0, notChecked: 0, nothingToCheck: 0 }, headline: 'h', verdict: 'fail', allPassed: false, seconds: 0.1,
});

describe('the CSV of failing elements', () => {
  const r = result([
    spec('Walls, "rated"', [el('Wand "Süd", außen', [A]), el(null, [A, B], null), el('line\nbreak', ['r'])]),
    spec('All fine', []),
    spec('Doors', [el('Ușă 1', ['x'])]),
  ]);
  const csv = failuresCsvParts(r).join('');
  it('starts with a UTF-8 byte order mark and the header, and ends lines with CRLF', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('quotes commas, quotes and line breaks, and keeps letters outside ASCII', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('plain')).toBe('plain');
    expect(csv).toContain('"Walls, ""rated""",,"Property set ""Pset_WallCommon"" not found.",,IfcWall,"Wand ""Süd"", außen","id-Wand ""Süd"", außen"');
    expect(csv).toContain('Ușă 1');
    expect(csv).toContain('"line\nbreak"');
  });
  it('holds one row per failing element and nothing for a specification without failures', () => {
    // Parse it back: a quoted cell may hold line breaks and commas.
    const rows: string[][] = [];
    let row: string[] = [], cell = '', quoted = false;
    const body = csv.slice(1);
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (quoted) { if (c === '"' && body[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r' && body[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
      else cell += c;
    }
    expect(rows.length - 1).toBe(failureCount(r));
    expect(failureCount(r)).toBe(4);
    expect(rows.every((x) => x.length === CSV_COLUMNS.length)).toBe(true);
    expect(rows[1]).toEqual(['Element', 'Walls, "rated"', '', A, '', 'IfcWall', 'Wand "Süd", außen', 'id-Wand "Süd", außen', '', 'Tower, east.ifc', 'req.ids']);
    expect(rows[2]).toEqual(['Element', 'Walls, "rated"', '', `${A} ${B}`, '', 'IfcWall', '', '', '', 'Tower, east.ifc', 'req.ids']);
    expect(rows.map((x) => x[1])).not.toContain('All fine');
  });
  it('is named after the model', () => expect(failuresCsvName('Tower.ifc')).toBe('Tower-failing-elements.csv'));
});

describe('the page report', () => {
  const check = { kind: 'report' as const, headline: 'h', valid: true, errors: 0, warnings: 0, version: '1.0', findings: [] };
  it('is valid JSON without a run', () => {
    const j = JSON.parse(pageReportParts('a.ids', false, check, null).join(''));
    expect(j).toEqual({ idsFile: 'a.ids', edited: false, writingAgainLeavesOut: [], ids: null, model: null, check: { valid: true, idsVersion: '1.0', errors: 0, warnings: 0, findings: [] }, run: null });
    expect(pageReportName('a.ids', null)).toBe('a-check-report.json');
  });
  it('lists, part by part, what writing the changed parts again leaves out of the opened file', () => {
    const leaves = [{ part: 2 as const, name: 'Walls', items: ['2 comments', 'the attribute fixed on a list value'] }, { part: 'info' as const, name: 'About this IDS', items: ['1 comment'] }];
    const j = JSON.parse(pageReportParts('a.ids', true, check, null, null, null, leaves).join(''));
    expect(j.writingAgainLeavesOut).toEqual(leaves);
  });
  it('is valid JSON with a run and holds every failing element', () => {
    const r = result([spec('S', failures), spec('T', [])]);
    const j = JSON.parse(pageReportParts('a.ids', true, check, r).join(''));
    expect(j.edited).toBe(true);
    expect(j.run.specs[0].failures).toHaveLength(failures.length);
    expect(j.run.verdict).toBe('fail');
    expect(pageReportName('a.ids', r)).toBe('Tower, east-ids-report.json');
  });
});

describe('kindOfFile', () => {
  it('knows a model and an IDS file by what they hold, whatever they are called', () => {
    expect(kindOfFile('x.ids', 'ISO-10303-21;\nHEADER;')).toBe('ifc');
    expect(kindOfFile('x.ifc', '<?xml version="1.0"?>\n<!-- c -->\n<ids xmlns="x">')).toBe('ids');
    expect(kindOfFile('x.ifc', '﻿<ids:ids xmlns:ids="x">', 'ifc')).toBe('ids');
  });
  it('otherwise goes by where the file was put, then by its extension', () => {
    expect(kindOfFile('x.txt', 'hello', 'ifc')).toBe('ifc');
    expect(kindOfFile('x.ifc', 'PK\u0003\u0004')).toBe('ifc');
    expect(kindOfFile('x.xml', '<html>')).toBe('ids');
    expect(kindOfFile('x.ifc', '<ifcXML>', 'ifc')).toBe('ifc');
  });
});

describe('elements that fail the same requirement with a value of their own', () => {
  const own = (n: number): FailingElement => ({ ifcClass: 'IfcWall', name: `Wall ${n}`, globalId: `id${n}`, reasons: [`Attribute "Name" is "Wall ${n}", expected "Waldo".`], found: [`Wall ${n}`] });
  it('are one group, not one group each: 20,000 walls with 20,000 names read as one reason', () => {
    const many = Array.from({ length: 20000 }, (_, i) => own(i + 1));
    const groups = groupFailures(many);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reason: 'Attribute "Name" is "…", expected "Waldo".', varies: true });
    expect(groups[0].elements).toHaveLength(20000);
    const { shown, notShown } = capGroups(groups, 200);
    expect([shown[0].elements.length, shown[0].total, notShown, shown[0].varies]).toEqual([200, 20000, 19800, true]);
  });
  it('keep the full sentence when they all have the same value, and stay apart from elements that fail something else', () => {
    const same = (n: number): FailingElement => ({ ...own(n), reasons: ['Attribute "Name" is "Wilma", expected "Waldo".'], found: ['Wilma'] });
    const groups = groupFailures([same(1), el('x', [A]), same(2), own(3)]);
    expect(groups.map((g) => [g.reason, g.elements.length, g.varies])).toEqual([
      ['Attribute "Name" is "…", expected "Waldo".', 3, true], [A, 1, false],
    ]);
    expect(groupFailures([same(1), same(2)]).map((g) => [g.reason, g.varies])).toEqual([['Attribute "Name" is "Wilma", expected "Waldo".', false]]);
  });
  it('20,000 elements that each fail for a different reason are 20,000 groups, and the counts still add up', () => {
    const groups = groupFailures(Array.from({ length: 20000 }, (_, i) => el(String(i), [`Reason ${i}.`])));
    expect(groups).toHaveLength(20000);
    const { shown, notShown } = capGroups(groups, 200);
    expect(shown.reduce((n, g) => n + g.elements.length, 0) + notShown).toBe(20000);
  });
});

describe('what the page says to do with a result', async () => {
  const { afterRun } = await import('../src/core/csv');
  const of = (verdict: RunResult['verdict'], specs: SpecRow[]) => afterRun({ verdict, specs });
  it('says "Nothing failed" only of a result that passed', () => {
    expect(of('pass', [spec('S', [])])).toBe('Nothing failed. Download the report to keep a record.');
    expect(of('fail', [{ ...spec('S', []), state: 'fail', wholeFailure: 'Needs one.' }])).toMatch(/^No single element failed: a specification failed as a whole/);
    expect(of('fail', [spec('S', [])])).toMatch(/^The result is Fail without a failing element or a failed specification to list/);
    expect(of('incomplete', [spec('S', [])])).toMatch(/not every specification could be checked/);
    expect(of('fail', [spec('S', [el('1', [A])])])).toMatch(/^Send the failing elements/);
  });
});
