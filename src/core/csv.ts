// The hand-over for the people who model: every failing element of a result as one CSV file that Excel opens correctly.
import type { RunResult } from './types';

export const CSV_COLUMNS = ['Specification', 'Why it failed', 'IFC class', 'Name', 'GlobalId', 'Model', 'IDS file'] as const;

/** One cell: quoted when it holds a comma, a quote or a line break; quotes doubled. */
export function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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

export function failureCount(result: RunResult): number {
  return result.specs.reduce((n, s) => n + s.failures.length, 0);
}
