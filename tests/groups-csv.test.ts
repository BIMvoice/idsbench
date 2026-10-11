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
    expect(csv).toContain('"Walls, ""rated""",Property set ""Pset_WallCommon"" not found.'.replace('Property', '"Property').replace('found.', 'found."') + ',IfcWall,"Wand ""Süd"", außen",id-Wand "Süd", außen'.replace('id-Wand "Süd", außen', '"id-Wand ""Süd"", außen"'));
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
    expect(rows[1]).toEqual(['Walls, "rated"', A, 'IfcWall', 'Wand "Süd", außen', 'id-Wand "Süd", außen', 'Tower, east.ifc', 'req.ids']);
    expect(rows[2]).toEqual(['Walls, "rated"', `${A} ${B}`, 'IfcWall', '', '', 'Tower, east.ifc', 'req.ids']);
    expect(rows.map((x) => x[0])).not.toContain('All fine');
  });
  it('is named after the model', () => expect(failuresCsvName('Tower.ifc')).toBe('Tower-failing-elements.csv'));
});

describe('the page report', () => {
  const check = { kind: 'report' as const, headline: 'h', valid: true, errors: 0, warnings: 0, version: '1.0', findings: [] };
  it('is valid JSON without a run', () => {
    const j = JSON.parse(pageReportParts('a.ids', false, check, null).join(''));
    expect(j).toEqual({ idsFile: 'a.ids', edited: false, ids: null, model: null, check: { valid: true, idsVersion: '1.0', errors: 0, warnings: 0, findings: [] }, run: null });
    expect(pageReportName('a.ids', null)).toBe('a-check-report.json');
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
