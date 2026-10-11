// "Download report": the check of the IDS file and, when a model was run, its result, as one JSON document.
import type { CheckView } from './checkview';
import { reportParts } from './format';
import type { RunResult } from './types';

type Report = Extract<CheckView, { kind: 'report' }>;

/** Which file a report is about: its name, its size in bytes and the SHA-256 of its bytes (null when the browser cannot compute one). */
export interface FileIdentity { name: string; bytes: number; sha256: string | null }

/** The SHA-256 of a file's bytes in hexadecimal, or null where the browser offers no digest (a page not served over HTTPS or from this computer). */
export async function sha256Of(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/**
 * The JSON in pieces. `edited` is true when the IDS that was checked holds changes that are not in a file yet.
 * `ids` and `model` say exactly which bytes were judged, so that a report cannot be taken for the report of another
 * file with the same name: `ids` is the text that was checked (and run), `model` the model file, null without one.
 */
export function pageReportParts(idsFile: string, edited: boolean, check: Report, run: RunResult | null, ids: FileIdentity | null = null, model: FileIdentity | null = null, leftOut: { part: 'info' | 'file' | number; name: string; items: string[] }[] = []): BlobPart[] {
  const head = JSON.stringify({
    idsFile,
    edited,
    /** What Download leaves out of the opened file when it writes a changed part again, part by part (empty when it leaves nothing out). */
    writingAgainLeavesOut: leftOut,
    ids,
    model,
    check: { valid: check.valid, idsVersion: check.version, errors: check.errors, warnings: check.warnings, findings: check.findings },
  }, null, 2).replace(/\n\}$/, '');
  if (!run) return [`${head},\n  "run": null\n}\n`];
  const run_ = reportParts(run);
  // The run's own closing line end is dropped: the document closes after it.
  const last = run_[run_.length - 1];
  return [`${head},\n  "run": `, ...run_.slice(0, -1), typeof last === 'string' ? last.replace(/\n$/, '') : last, '\n}\n'];
}

export function pageReportName(idsName: string, run: RunResult | null): string {
  if (run) return `${run.ifcFile.replace(/\.ifc$/i, '') || 'model'}-ids-report.json`;
  return `${idsName.replace(/\.(ids|xml)$/i, '') || 'ids'}-check-report.json`;
}
