/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Finding } from '@idsbench/check';
import { AppError } from './errors';

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

/** Turn the engine's answer for `xml` into what the page shows. */
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

/** How long a check of a small IDS file may take before the page says it did not answer. */
export const CHECK_ALLOWED_MS = 30_000;
/**
 * What is added for each megabyte of the file. 63.5 MB of IDS was checked in 17.2 s (Node, on the computer this was
 * written on), about 0.3 s a megabyte; this is ten times that, for a slow computer.
 */
export const CHECK_MS_PER_MB = 3_000;
/** How long the check of a text of this many characters may take. */
export function checkAllowed(chars: number): number {
  return CHECK_ALLOWED_MS + Math.round((chars / (1024 * 1024)) * CHECK_MS_PER_MB);
}
export const CHECK_STALLED =
  'The check of the IDS file did not answer, so there is no verdict. The browser may have stopped it, most likely for want of memory. Check again; if it happens again, close other tabs and try once more.';
/**
 * The schema validator works in a Worker of its own that gives no sign of life while it works, and a Worker the browser
 * ends without an error event never answers: without this the page would wait for ever.
 */
export class CheckStalled extends AppError {
  constructor() { super('check-stalled', CHECK_STALLED); }
}

/**
 * Not done yet: only the schema validator works in a Worker; reading the file and the engine's rules run on the page's
 * own thread. Since paths are made at the cost of an element's depth, that is linear in the size of the file and in the
 * number of findings (20,000 findings, each a misspelled class with a "Did you mean", took 4 to 8 s in Node, most of it
 * looking for the closest class name). Moving the whole engine into a Worker would also need the page's tests to run
 * it there; it is left for when a real file needs it.
 *
 * Check the text with the engine, loaded on first use so the first paint never pays for it. Throws CheckStalled when the
 * engine has not answered within checkAllowed (an engine that answers later is not listened to).
 */
export async function checkText(xml: string): Promise<CheckView> {
  const early = sentenceForText(xml);
  if (early) return { kind: 'sentence', text: early };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CheckStalled()), checkAllowed(xml.length)); });
  try {
    const result = await Promise.race([import('@idsbench/check').then(({ checkIds }) => checkIds(xml)), stalled]);
    return describeResult(xml, result);
  } finally {
    clearTimeout(timer);
  }
}

export const NOT_UTF8 =
  'This file says it is written in UTF-8 but holds bytes that are not, so some of its letters cannot be read correctly. Save it again as UTF-8 in the tool that made it, and choose the new file.';
export const UNKNOWN_ENCODING = (name: string) =>
  `This file is written in the encoding ${name}, which cannot be read here. Save it again as UTF-8 and choose the new file.`;

export interface ReadText {
  text: string;
  /** True when the file starts with a byte order mark (which `text` does not hold). */
  bom: boolean;
  /** False when the file is in another encoding than UTF-8: `text` is then its letters, with the XML declaration saying UTF-8. */
  utf8: boolean;
  /** The encoding the file was read in, as the file names it. */
  encoding: string;
}

/**
 * The letters of an XML file from its bytes: by its byte order mark, else by the encoding its XML declaration names,
 * else UTF-8. Bytes that are not valid in that encoding are never replaced silently: the file is refused, because a
 * replaced letter in a name or a value would be checked against the model as if the author had written it.
 */
export function decodeXml(bytes: Uint8Array): ReadText | { sentence: string } {
  const [a, b, c] = bytes;
  let encoding = 'UTF-8', bom = false;
  if (a === 0xef && b === 0xbb && c === 0xbf) bom = true;
  else if (a === 0xff && b === 0xfe) { encoding = 'UTF-16LE'; bom = true; }
  else if (a === 0xfe && b === 0xff) { encoding = 'UTF-16BE'; bom = true; }
  else {
    const head = String.fromCharCode(...bytes.subarray(0, 200));
    const named = /^\s*<\?xml[^>]*?\sencoding\s*=\s*["']([^"']+)["']/.exec(head)?.[1];
    if (named) encoding = named;
  }
  const utf8 = /^utf-?8$/i.test(encoding);
  let text: string;
  try {
    text = new TextDecoder(utf8 ? 'utf-8' : encoding, { fatal: true }).decode(bytes);
  } catch (e) {
    return { sentence: e instanceof RangeError ? UNKNOWN_ENCODING(encoding) : utf8 ? NOT_UTF8 : UNKNOWN_ENCODING(encoding) };
  }
  // What the page keeps and writes is UTF-8, so the declaration has to say so.
  if (!utf8) text = text.replace(/^(\s*<\?xml[^>]*?\sencoding\s*=\s*["'])[^"']+/, '$1UTF-8');
  return { text, bom, utf8, encoding };
}

/**
 * Read a file for checking. Looks at the first bytes first, so a large IFC model dropped by mistake is
 * recognised without reading it all.
 */
export async function readForCheck(file: File): Promise<ReadText | { sentence: string }> {
  if (file.size === 0) return { sentence: EMPTY_FILE };
  const head = sentenceForText(await file.slice(0, 64).text());
  if (head) return { sentence: head };
  if (file.size > MAX_IDS_BYTES) return { sentence: TOO_BIG };
  const read = decodeXml(new Uint8Array(await file.arrayBuffer()));
  if ('sentence' in read) {
    // A file that is not text at all (a picture, a zip) is not an encoding problem: say what it is not.
    const start = String.fromCharCode(...new Uint8Array(await file.slice(0, 64).arrayBuffer())).replace(/^\xEF\xBB\xBF/, '').trimStart();
    return start.startsWith('<') ? read : { sentence: NOT_XML };
  }
  return read;
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
