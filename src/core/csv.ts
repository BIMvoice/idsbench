// The hand-over for the people who model: every failing element of a result as one CSV file that Excel opens correctly.
import type { RunResult } from './types';

export const CSV_COLUMNS = ['Specification', 'Why it failed', 'IFC class', 'Name', 'GlobalId', 'Model', 'IDS file'] as const;

const PLAIN_NUMBER = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/;

/**
 * A spreadsheet reads a cell that starts with =, +, - or @ (or a tab or a carriage return) as a formula, and names in
 * a model are written by whoever made the model. Such a cell gets an apostrophe in front, the usual way exports make
 * it plain text; a plain number (-12.5) is left alone. The apostrophe is visible in some programs: it is not part of
 * the name in the model.
 */
export function plainText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) && !PLAIN_NUMBER.test(v) ? `'${v}` : v;
}

/** One cell: never a formula (see plainText); quoted when it holds a comma, a semicolon, a quote or a line break; quotes doubled. */
export function csvCell(value: string): string {
  const v = plainText(value);
  return /[",;\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * The CSV in pieces (one per specification, so a very large result is never one enormous string). It starts with a
 * UTF-8 byte order mark, which is what makes Excel read names with accents correctly, and uses CRLF line ends.
 * Every failing element is in it, not only those listed on the page.
 */
export function failuresCsvParts(result: RunResult): string[] {
  const row = (cells: string[]) => `${cells.map(csvCell).join(',')}\r\n`;
  const parts = [`﻿${row([...CSV_COLUMNS])}`];
  for (const s of result.specs) {
    if (s.failures.length === 0) continue;
    parts.push(s.failures.map((f) => row([s.name, f.reasons.join(' '), f.ifcClass, f.name ?? '', f.globalId ?? '', result.ifcFile, result.idsFile])).join(''));
  }
  return parts;
}

export function failuresCsvName(ifcName: string): string {
  return `${ifcName.replace(/\.ifc$/i, '') || 'model'}-failing-elements.csv`;
}

/**
 * What to do with a result, in one sentence. "Nothing failed" is said only of a result that passed: a required
 * specification that matches nothing fails without a single failing element, and so does not make an empty list good news.
 */
export function afterRun(result: Pick<RunResult, 'verdict' | 'specs'>): string {
  if (failureCount(result) > 0) return 'Send the failing elements to the people who model: Download failing elements gives the complete list.';
  if (result.verdict === 'pass') return 'Nothing failed. Download the report to keep a record.';
  if (result.verdict === 'fail') return 'No single element failed: a specification failed as a whole, and its row says why. Download the report to keep a record.';
  return 'No element failed, but not every specification could be checked: see the rows marked Not checked. Download the report to keep a record.';
}

export function failureCount(result: Pick<RunResult, 'specs'>): number {
  return result.specs.reduce((n, s) => n + s.failures.length, 0);
}
