// "Download report": the check of the IDS file and, when a model was run, its result, as one JSON document.
import type { CheckView } from './checkview';
import { reportParts } from './format';
import type { RunResult } from './types';

type Report = Extract<CheckView, { kind: 'report' }>;

/** The JSON in pieces. `edited` is true when the IDS that was checked holds changes that are not in a file yet. */
export function pageReportParts(idsFile: string, edited: boolean, check: Report, run: RunResult | null): string[] {
  const head = JSON.stringify({
    idsFile,
    edited,
    check: { valid: check.valid, idsVersion: check.version, errors: check.errors, warnings: check.warnings, findings: check.findings },
  }, null, 2).replace(/\n\}$/, '');
  if (!run) return [`${head},\n  "run": null\n}\n`];
  return [`${head},\n  "run": `, ...reportParts(run).map((p, i, all) => (i === all.length - 1 ? p.replace(/\n$/, '') : p)), '\n}\n'];
}

export function pageReportName(idsName: string, run: RunResult | null): string {
  if (run) return `${run.ifcFile.replace(/\.ifc$/i, '') || 'model'}-ids-report.json`;
  return `${idsName.replace(/\.(ids|xml)$/i, '') || 'ids'}-check-report.json`;
}
