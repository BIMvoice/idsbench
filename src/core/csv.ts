// The hand-over for the people who model: every failing element of a result as one CSV file that Excel opens correctly.
import type { FailingElement, RunResult, SpecRow } from './types';

/** What a row of the file is about: one element, or a whole specification that failed with no single element to blame. */
export const ROW_KINDS = { element: 'Element', specification: 'Whole specification' } as const;
export const CSV_COLUMNS = ['Row about', 'Specification', 'Requirement', 'Why it failed', 'What to fix', 'IFC class', 'Name', 'GlobalId', 'Storey or space', 'Model', 'IDS file'] as const;

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

const rowOf = (cells: string[]) => `${cells.map(csvCell).join(',')}\r\n`;
export const csvHeader = () => `\ufeff${rowOf([...CSV_COLUMNS])}`;
/** The row of one failing element. */
export const elementCsvRow = (specName: string, f: FailingElement, ifcFile: string, idsFile: string, requirement = '') =>
  rowOf([ROW_KINDS.element, specName, requirement, f.reasons.join(' '), (f.toFix ?? []).filter(Boolean).join('; '), f.ifcClass, f.name ?? '', f.globalId ?? '', f.place ?? '', ifcFile, idsFile]);
/** The row of a specification that failed as a whole: no element, and the reason it failed. */
export const wholeCsvRow = (specName: string, why: string, ifcFile: string, idsFile: string, requirement = '', toFix = '') =>
  rowOf([ROW_KINDS.specification, specName, requirement, why, toFix, '', '', '', '', ifcFile, idsFile]);

/** How many failing elements a row holds, whatever of them the row keeps in memory. */
export const failureTotalOf = (s: Pick<SpecRow, 'failures' | 'failureTotal'>): number => s.failureTotal ?? s.failures.length;

/** How many specifications have no result because the engine would answer them wrongly for this model (see SpecRow.withheld); each has a row of its own in the CSV. */
export function withheldCount(result: Pick<RunResult, 'specs'>): number {
  return result.specs.filter((s) => s.withheld).length;
}

/** How many specifications failed as a whole (see SpecRow.wholeFailure). */
export function wholeFailureCount(result: Pick<RunResult, 'specs'>): number {
  return result.specs.filter((s) => s.wholeFailure).length;
}

/**
 * The CSV in pieces (strings and, for a result made in the worker, blobs; one run of pieces per specification, so a
 * very large result is never one enormous string). It starts with a UTF-8 byte order mark, which is what makes Excel
 * read names with accents correctly, and uses CRLF line ends. Every failing element is in it, not only those listed
 * on the page, and so is every specification that failed as a whole, as a row of its own marked "Whole specification"
 * in the first column (the element rows are marked "Element"), so that a filter on that column separates the two.
 */
export function failuresCsvParts(result: RunResult): BlobPart[] {
  const parts: BlobPart[] = [csvHeader()];
  result.specs.forEach((s, i) => {
    const mine: BlobPart[] = [];
    if (s.wholeFailure) mine.push(wholeCsvRow(s.name, s.wholeFailure, result.ifcFile, result.idsFile, s.requirement ?? '', s.wholeFix ?? ''));
    else if (s.withheld) mine.push(wholeCsvRow(s.name, s.withheld, result.ifcFile, result.idsFile, s.requirement ?? '', 'Wait for the fixed engine, or check this specification with another tool'));
    const spilled = result.spilled?.[i];
    if (spilled) mine.push(...spilled.csv);
    else if (s.failures.length) mine.push(s.failures.map((f) => elementCsvRow(s.name, f, result.ifcFile, result.idsFile, s.requirement ?? '')).join(''));
    if (mine.length) parts.push(...mine);
  });
  return parts;
}

/** A CSV text as rows of cells (quoted cells may hold commas, quotes and line breaks); the byte order mark is skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const b = text.replace(/^\ufeff/, '');
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (quoted) { if (c === '"' && b[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && b[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  return rows;
}

export function failuresCsvName(ifcName: string): string {
  return `${ifcName.replace(/\.ifc$/i, '') || 'model'}-failing-elements.csv`;
}

/**
 * What to do with a result, in one sentence. "Nothing failed" is said only of a result that passed: a required
 * specification that matches nothing fails without a single failing element, and so does not make an empty list good news.
 */
export function afterRun(result: Pick<RunResult, 'verdict' | 'specs'>): string {
  const elements = failureCount(result), whole = wholeFailureCount(result);
  if (elements > 0 && whole > 0) return 'Send the failing elements to the people who model: Download failing elements gives the complete list, with a row for each specification that failed as a whole.';
  if (elements > 0) return 'Send the failing elements to the people who model: Download failing elements gives the complete list.';
  if (whole > 0) return 'No single element failed: a specification failed as a whole, and its row says why. Download failing elements gives it as a row, and Download report keeps a record.';
  if (result.verdict === 'pass') return 'Nothing failed. Download the report to keep a record.';
  if (result.verdict === 'fail') return 'The result is Fail without a failing element or a failed specification to list. Download the report to keep a record.';
  return 'No element failed, but not every specification could be checked: see the rows marked Not checked. Download the report to keep a record.';
}

/** The failing elements of a result, all of them (not only those a row holds). */
export function failureCount(result: Pick<RunResult, 'specs'>): number {
  return result.specs.reduce((n, s) => n + failureTotalOf(s), 0);
}
