import type { Finding } from '@idsbench/check';

/** How many finding rows the page lists. The downloaded report holds all of them. */
export const ROW_CAP = 200;
/** An IDS file larger than this is not read; it is not an IDS file anyone wrote. */
export const MAX_IDS_BYTES = 100 * 1024 * 1024;
/** A line longer than this is shown as a window around the problem, not in full. */
export const LINE_CAP = 300;

export const NOT_UPLOADED = 'This file is checked in your browser and is not uploaded.';

/** Errors first, then by position in the file; findings without a line come last in their group. Stable. */
export function orderFindings(findings: Finding[]): Finding[] {
  const rank = (f: Finding) => (f.severity === 'error' ? 0 : 1);
  const at = (n: number | undefined) => n ?? Number.MAX_SAFE_INTEGER;
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || at(a.f.line) - at(b.f.line) || at(a.f.column) - at(b.f.column) || a.i - b.i)
    .map((x) => x.f);
}

/** "line 14", "line 14, column 9", or null when the engine could not say where. */
export function whereText(f: Pick<Finding, 'line' | 'column'>): string | null {
  if (!f.line) return null;
  return f.column ? `line ${f.line}, column ${f.column}` : `line ${f.line}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function headlineFor(errors: number, warnings: number): string {
  if (errors > 0) {
    return `This IDS file has ${plural(errors, 'problem', 'problems')}${warnings > 0 ? ` and ${plural(warnings, 'thing', 'things')} to look at` : ''}.`;
  }
  if (warnings > 0) return `This IDS file is valid, with ${plural(warnings, 'thing', 'things')} to look at.`;
  return 'This IDS file is valid.';
}

/**
 * The offending line of the file with two lines of context on each side, as plain text:
 * a line-number gutter, ">" on the line itself and a "^" under the column when it is known.
 * Null when the position is not inside the file. Line breaks may be LF, CRLF or CR.
 */
export function excerpt(xml: string, line: number, column?: number, context = 2): string[] | null {
  if (!Number.isInteger(line) || line < 1) return null;
  const lines = xml.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  if (line > lines.length) return null;
  const from = Math.max(1, line - context);
  const to = Math.min(lines.length, line + context);
  const width = String(to).length;
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    let text = lines[n - 1];
    let col = n === line && column && column >= 1 ? column : undefined;
    if (text.length > LINE_CAP) {
      // A very long line (an IDS saved on one line): show a window around the column, or its start.
      const centre = col ?? 1;
      const start = Math.max(0, Math.min(centre - 1 - Math.floor(LINE_CAP / 2), text.length - LINE_CAP));
      const piece = text.slice(start, start + LINE_CAP);
      text = `${start > 0 ? '…' : ''}${piece}${start + LINE_CAP < text.length ? '…' : ''}`;
      if (col !== undefined) col = col - start + (start > 0 ? 1 : 0);
    }
    out.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${text}`);
    if (n === line && col !== undefined && col >= 1 && col <= text.length + 1) {
      // Keep tabs as tabs in the padding so the caret lines up in a monospaced view.
      const pad = [...text.slice(0, col - 1)].map((c) => (c === '\t' ? '\t' : ' ')).join('');
      out.push(`  ${' '.repeat(width)} | ${pad}^`);
    }
  }
  return out;
}

export type CheckView =
  | { kind: 'sentence'; text: string }
  | {
      kind: 'report';
      headline: string;
      valid: boolean;
      errors: number;
      warnings: number;
      /** The version the file declares, or null when it names none. */
      version: string | null;
      /** All findings, errors first. */
      findings: Finding[];
    };

export const EMPTY_FILE = 'This file is empty. Choose the IDS file again, or save it again from the tool that made it.';
export const IS_IFC =
  'This is an IFC model, not an IDS file. Put the IDS file in the IDS box and the model in the IFC box.';
export const NOT_XML =
  'This file is not XML, so it is not an IDS file. Check that you chose the right file.';
export const BROKEN_XML =
  'This file is not valid XML, so it could not be checked further. Open it in the tool that made it, save it again, and choose the new file.';
export const NOT_IDS = (root: string | undefined) =>
  `This is an XML file but not an IDS file${root ? `: it starts with <${root}>, not <ids>` : ''}. Check that you chose the right file.`;
export const TOO_BIG = 'This file is far too large to be an IDS file. Check that you chose the right file.';

/** What the first bytes of a file already say, before any checking. Null when it needs the engine. */
export function sentenceForText(text: string): string | null {
  const t = text.replace(/^﻿/, '').trimStart();
  if (t === '') return EMPTY_FILE;
  if (t.startsWith('ISO-10303-21')) return IS_IFC;
  return null;
}

/** Turn the engine's answer for `xml` into what the Check tab shows. */
export function describeResult(xml: string, result: { valid: boolean; idsVersion?: string; findings: Finding[] }): CheckView {
  const first = result.findings[0];
  const t = xml.replace(/^﻿/, '').trimStart();
  if (first?.code === 'not-an-ids-file') {
    return { kind: 'sentence', text: NOT_IDS(/<([^>\s]+)>/.exec(first.message)?.[1]) };
  }
  const findings = orderFindings(result.findings);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  if (findings.some((f) => f.code === 'xml-not-well-formed')) {
    if (!t.startsWith('<')) return { kind: 'sentence', text: NOT_XML };
    return { kind: 'report', headline: BROKEN_XML, valid: false, errors, warnings, version: null, findings };
  }
  return {
    kind: 'report',
    headline: headlineFor(errors, warnings),
    valid: errors === 0,
    errors,
    warnings,
    version: result.idsVersion ?? null,
    findings,
  };
}

/** Load the engine on first use, so the first paint never pays for it. */
export async function checkText(xml: string): Promise<CheckView> {
  const early = sentenceForText(xml);
  if (early) return { kind: 'sentence', text: early };
  const { checkIds } = await import('@idsbench/check');
  return describeResult(xml, await checkIds(xml));
}

/**
 * Read a file for checking. Looks at the first bytes first, so a large IFC model dropped by mistake is
 * recognised without reading it all.
 */
export async function readForCheck(file: File): Promise<{ text: string } | { sentence: string }> {
  if (file.size === 0) return { sentence: EMPTY_FILE };
  const head = sentenceForText(await file.slice(0, 64).text());
  if (head) return { sentence: head };
  if (file.size > MAX_IDS_BYTES) return { sentence: TOO_BIG };
  return { text: await file.text() };
}

export function reportFileName(idsName: string): string {
  return `${idsName.replace(/\.(ids|xml)$/i, '') || 'ids'}-check-report.json`;
}

export function reportJson(fileName: string, view: Extract<CheckView, { kind: 'report' }>): string {
  return JSON.stringify(
    {
      file: fileName,
      valid: view.valid,
      idsVersion: view.version,
      errors: view.errors,
      warnings: view.warnings,
      findings: view.findings,
    },
    null,
    2,
  ) + '\n';
}
