import { describe, expect, it } from 'vitest';
import type { Finding } from '@idsbench/check';
import {
  describeResult, excerpt, headlineFor, orderFindings, readForCheck, reportFileName, reportJson, sentenceForText, whereText, LINE_CAP,
} from '../src/core/checkview';

const f = (over: Partial<Finding>): Finding => ({ severity: 'error', code: 'c', message: 'm', ...over });

describe('orderFindings', () => {
  it('puts errors before warnings, then sorts by line and column', () => {
    const out = orderFindings([
      f({ code: 'w1', severity: 'warning', line: 1 }),
      f({ code: 'e3', line: 9, column: 2 }),
      f({ code: 'e2', line: 9, column: 1 }),
      f({ code: 'e1', line: 3 }),
    ]);
    expect(out.map((x) => x.code)).toEqual(['e1', 'e2', 'e3', 'w1']);
  });
  it('puts a finding with no line after the ones that have one, within its severity', () => {
    const out = orderFindings([f({ code: 'none' }), f({ code: 'late', line: 500 }), f({ code: 'w', severity: 'warning' })]);
    expect(out.map((x) => x.code)).toEqual(['late', 'none', 'w']);
  });
  it('keeps the engine order for equal positions and does not change its input', () => {
    const input = [f({ code: 'a', line: 2 }), f({ code: 'b', line: 2 }), f({ code: 'c', line: 2 })];
    expect(orderFindings(input).map((x) => x.code)).toEqual(['a', 'b', 'c']);
    expect(input.map((x) => x.code)).toEqual(['a', 'b', 'c']);
  });
});

describe('whereText and headlineFor', () => {
  it('names line, or line and column, or nothing', () => {
    expect(whereText({ line: 14 })).toBe('line 14');
    expect(whereText({ line: 14, column: 9 })).toBe('line 14, column 9');
    expect(whereText({})).toBeNull();
    expect(whereText({ column: 4 })).toBeNull();
  });
  it('says valid, problems, or valid with things to look at', () => {
    expect(headlineFor(0, 0)).toBe('This IDS file is valid.');
    expect(headlineFor(3, 0)).toBe('This IDS file has 3 problems.');
    expect(headlineFor(1, 0)).toBe('This IDS file has 1 problem.');
    expect(headlineFor(0, 1)).toBe('This IDS file is valid, with 1 thing to look at.');
    expect(headlineFor(0, 2)).toBe('This IDS file is valid, with 2 things to look at.');
    expect(headlineFor(2, 1)).toBe('This IDS file has 2 problems and 1 thing to look at.');
  });
});

describe('excerpt', () => {
  const file = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].join('\n');
  it('shows the line with two lines of context and a caret under the column', () => {
    expect(excerpt(file, 4, 2)).toEqual(['  2 | two', '  3 | three', '> 4 | four', '    |  ^', '  5 | five', '  6 | six']);
  });
  it('works on the first line (no context above)', () => {
    expect(excerpt(file, 1)).toEqual(['> 1 | one', '  2 | two', '  3 | three']);
  });
  it('works on the last line (no context below), and the gutter fits the widest number', () => {
    const long = Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n');
    expect(excerpt(long, 12, 1)).toEqual(['  10 | l10', '  11 | l11', '> 12 | l12', '     | ^']);
  });
  it('is null for a line outside the file or a nonsense line', () => {
    expect(excerpt(file, 8)).toBeNull();
    expect(excerpt(file, 0)).toBeNull();
    expect(excerpt(file, 1.5)).toBeNull();
  });
  it('counts CRLF and lone CR as one line break each and shows no stray carriage return', () => {
    const crlf = 'a\r\nb\r\nc\r\nd';
    expect(excerpt(crlf, 3)).toEqual(['  1 | a', '  2 | b', '> 3 | c', '  4 | d']);
    expect(excerpt('a\rb\rc', 2)).toEqual(['  1 | a', '> 2 | b', '  3 | c']);
    expect(excerpt(crlf, 3)!.join('').includes('\r')).toBe(false);
  });
  it('ignores a leading byte order mark', () => {
    expect(excerpt('\uFEFF<ids>\n<x/>', 1, 1)).toEqual(['> 1 | <ids>', '    | ^', '  2 | <x/>']);
  });
  it('shows a very long line as a window around the column, with the caret on the right character', () => {
    const line = 'x'.repeat(5000) + 'TARGET' + 'y'.repeat(5000);
    const out = excerpt(line, 1, 5001)!;
    expect(out[0].length).toBeLessThan(LINE_CAP + 20);
    expect(out[0]).toContain('TARGET');
    const text = out[0].slice(out[0].indexOf('| ') + 2);
    const caret = out[1].slice(out[1].indexOf('| ') + 2);
    expect(text[caret.indexOf('^')]).toBe('T');
    expect(out[0].endsWith('…')).toBe(true);
  });
  it('shows the start of a very long context line, never the whole of it', () => {
    const out = excerpt(`${'z'.repeat(9000)}\nshort\n`, 2)!;
    expect(out[0].length).toBeLessThan(LINE_CAP + 20);
    expect(out[0].endsWith('…')).toBe(true);
  });
  it('a very long line with the column near its end still shows the column', () => {
    const line = 'a'.repeat(1000) + 'END';
    const out = excerpt(line, 1, 1003)!;
    const text = out[0].slice(out[0].indexOf('| ') + 2);
    const caret = out[1].slice(out[1].indexOf('| ') + 2);
    expect(text[caret.indexOf('^')]).toBe('D');
  });
  it('keeps a tab as a tab in the caret padding so it lines up', () => {
    expect(excerpt('\t<a b=1>', 1, 5)![1]).toBe('    | \t   ^');
  });
  it('a finding with no column gets no caret', () => {
    expect(excerpt(file, 3)!.filter((l) => l.includes('^'))).toEqual([]);
  });
});

describe('what the first bytes say', () => {
  it('an empty or blank file', () => {
    expect(sentenceForText('')).toMatch(/is empty/);
    expect(sentenceForText(' \r\n\t')).toMatch(/is empty/);
  });
  it('an IFC model, also after a byte order mark', () => {
    expect(sentenceForText('ISO-10303-21;\nHEADER;')).toMatch(/IFC model, not an IDS file/);
    expect(sentenceForText('﻿  ISO-10303-21;')).toBe('This is an IFC model, not an IDS file. Put the IDS file in the IDS box and the model in the IFC box.');
  });
  it('anything else needs the engine', () => expect(sentenceForText('<ids/>')).toBeNull());
  it('readForCheck recognises an IFC from its first bytes and an empty file without reading them', async () => {
    expect(await readForCheck(new File(['ISO-10303-21;\n' + 'x'.repeat(1000)], 'm.ifc'))).toMatchObject({ sentence: expect.stringMatching(/IFC model/) });
    expect(await readForCheck(new File([], 'e.ids'))).toMatchObject({ sentence: expect.stringMatching(/is empty/) });
    expect(await readForCheck(new File(['<ids/>'], 'a.ids'))).toEqual({ text: '<ids/>', bom: false, utf8: true, encoding: 'UTF-8' });
  });
});

describe('describeResult', () => {
  const ok = { valid: true, idsVersion: '1.0', findings: [] as Finding[] };
  it('a valid file', () => {
    expect(describeResult('<ids/>', ok)).toMatchObject({ kind: 'report', valid: true, version: '1.0', errors: 0, headline: 'This IDS file is valid.' });
  });
  it('problems, errors first', () => {
    const v = describeResult('<ids/>', { valid: false, idsVersion: '1.0', findings: [f({ severity: 'warning', line: 1 }), f({ line: 8 }), f({ line: 2 })] });
    expect(v).toMatchObject({ kind: 'report', valid: false, errors: 2, warnings: 1, headline: 'This IDS file has 2 problems and 1 thing to look at.' });
    if (v.kind === 'report') expect(v.findings.map((x) => x.line)).toEqual([2, 8, 1]);
  });
  it('a root element that is not <ids> is one sentence naming it', () => {
    const v = describeResult('<html/>', { valid: false, findings: [f({ code: 'not-an-ids-file', message: 'The root element is <html>, but an IDS file must start with <ids xmlns="x">.' })] });
    expect(v).toEqual({ kind: 'sentence', text: expect.stringContaining('starts with <html>, not <ids>') });
  });
  it('text that is not XML at all is one sentence with no rows', () => {
    const v = describeResult('this is not xml', { valid: false, findings: [f({ code: 'xml-not-well-formed', line: 1, column: 1 })] });
    expect(v).toEqual({ kind: 'sentence', text: expect.stringMatching(/is not XML/) });
  });
  it('XML that breaks off keeps its position as a row, under a sentence', () => {
    const v = describeResult('<ids><info>', { valid: false, findings: [f({ code: 'xml-not-well-formed', line: 1, column: 12 })] });
    expect(v).toMatchObject({ kind: 'report', valid: false, errors: 1, headline: expect.stringMatching(/not valid XML/) });
  });
});

describe('report file', () => {
  it('is named after the IDS file', () => {
    expect(reportFileName('walls.ids')).toBe('walls-check-report.json');
    expect(reportFileName('.ids')).toBe('ids-check-report.json');
  });
  it('is one JSON document with every finding', () => {
    const v = describeResult('<ids/>', { valid: false, idsVersion: '1.0', findings: [f({ line: 3, column: 4, path: 'ids/info' })] });
    if (v.kind !== 'report') throw new Error('report expected');
    expect(JSON.parse(reportJson('walls.ids', v))).toEqual({
      file: 'walls.ids', valid: false, idsVersion: '1.0', errors: 1, warnings: 0,
      findings: [{ severity: 'error', code: 'c', message: 'm', line: 3, column: 4, path: 'ids/info' }],
    });
  });
});
